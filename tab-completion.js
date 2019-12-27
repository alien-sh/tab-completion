const fs = require("fs");
const path = require("path");
const chalk = require("chalk");

const listDir = dir => fs.readdirSync(dir).map(file => path.join(dir, file));
const isExecutable = file => {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const { PATH } = process.env;
const dirs = PATH.split(":");
const files = dirs.map(listDir).flat();
const executables = files.filter(isExecutable).map(file => path.basename(file));

const commands = {
  executables
};

const getOptionsFile = query => {
  const dirname = query.endsWith(path.sep) ? query : path.dirname(query);
  const basename = query.endsWith(path.sep) ? "" : path.basename(query);
  const files = fs
    .readdirSync(dirname)
    .filter(file => file.startsWith(basename));
  return query.includes(path.sep)
    ? files.map(file => ({ display: file, value: path.join(dirname, file) }))
    : files.map(file => ({ display: file, value: file }));
};

const getOptionsCommand = query =>
  Object.values(commands)
    .flat()
    .filter(command => command.startsWith(query))
    .map(command => ({ display: command, value: command }));

const getOptions = (mode, query) => {
  return mode == "file" ? getOptionsFile(query) : getOptionsCommand(query);
};

function getWordAt(str, pos) {
  // Perform type conversions.
  str = String(str);
  pos = Number(pos) >>> 0;

  // Search for the word's beginning and end.
  var left = str.slice(0, pos + 1).search(/\S+$/),
    right = str.slice(pos).search(/\s/);

  // The last word in the string is a special case.
  if (right < 0) {
    return str.slice(left);
  }

  // Return the word, using the located bounds to postct it from the string.
  return str.slice(left, right + pos);
}

const removeParens = word => word.replace(/^\(/, "").replace(/\)$/, "");

const hasEqualParens = str =>
  (str.match(/\(/g) || []).length == (str.match(/\)/g) || []).length;

const toChunks = (arr, size) => {
  const chunks = [];
  const clone = [...arr];
  while (clone.length > 0) chunks.push(clone.splice(0, size));
  return chunks;
};

const getRowWidth = (rows, padding) =>
  rows[0]
    .map((_, i) => getColumnWidth(rows, i, padding))
    .reduce((a, b) => a + b, 0);

const getColumnWidth = (rows, i, padding) =>
  Math.max(...rows.map(row => (row[i] ? row[i].length : 0))) + padding * 2;

const enumerate = arr => arr.map((item, i) => [item, i]);

const toTable = (items, max, currentIndex) => {
  let columnCount = items.length;
  let chunks = toChunks(items, columnCount);
  let rowWidth = getRowWidth(chunks, 2);
  while (rowWidth > max) {
    columnCount--;
    chunks = toChunks(items, columnCount);
    rowWidth = getRowWidth(chunks, 2);
  }
  let table = "";
  for (const [row, r] of enumerate(chunks)) {
    for (const [col, c] of enumerate(row)) {
      const padSize = getColumnWidth(chunks, c, 2) - 2 - col.length - 1;
      const item = " " + col + " ".repeat(padSize);
      const colorized =
        currentIndex == r * columnCount + c ? chalk.bgWhite(item) : item;
      table += " " + colorized + " ";
    }
    table += "\n";
  }
  return "\n" + table.slice(0, -1);
};

module.exports = core => {
  let tabbing = false,
    currentIndex = 0,
    options = [],
    query;
  core.repl.preEaters.push(function(key) {
    if (this.isBusy) return;
    if (!["\t", "\r"].includes(key)) {
      currentIndex = 0;
      tabbing = false;
    }
  });
  core.repl.preEaters.push(function(key) {
    if (this.isBusy) return;
    this.postOutput = "";
  });
  core.repl.keyEaters["\t"] = [
    function(key) {
      if (this.isBusy) return;
      const { x, y, currentInput } = this;
      const size = this.size();
      const index = size * y + x - 1;
      const currentWord = getWordAt(currentInput, index);
      const mode = currentWord.startsWith("(") ? "command" : "file";
      options =
        query == currentWord
          ? options
          : getOptions(mode, removeParens(currentWord)).slice(0, 20);
      query = currentWord;
      if (options.length) {
        tabbing = true;
        this.clear();
        this.postOutput = toTable(
          options.map(({ display }) => display),
          this.stdout.columns,
          currentIndex
        );
        currentIndex++;
        if (currentIndex > options.length - 1) {
          currentIndex = 0;
        }
        this.preprint();
        this.print();
      }
    }
  ];
  core.repl.keyEaters["\r"].unshift(function(key) {
    if (this.isBusy) return;
    if (tabbing) {
      const index = currentIndex == 0 ? options.length - 1 : currentIndex - 1;
      const { value } = options[index];
      for (const char of value.slice(removeParens(query).length)) {
        this.insertAtCursor(char);
      }
      this.clear();
      this.preprint();
      this.print();
      return false;
    }
    tabbing = false;
    return true;
  });
};
