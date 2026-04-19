const fs = require('fs-extra');
const path = require('path');

const STATE_PATH = path.resolve(process.cwd(), 'state.json');

async function readState() {
  try {
    const exists = await fs.pathExists(STATE_PATH);
    if (!exists) return {};
    return await fs.readJson(STATE_PATH);
  } catch (err) {
    console.warn('Warning: could not read state.json, starting fresh.');
    return {};
  }
}

async function writeState(state) {
  await fs.writeJson(STATE_PATH, state, { spaces: 2 });
}

async function getStateKey(key) {
  const state = await readState();
  return state[key];
}

async function setStateKey(key, value) {
  const state = await readState();
  state[key] = value;
  await writeState(state);
}

module.exports = {
  readState,
  writeState,
  getStateKey,
  setStateKey,
};
