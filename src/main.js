'use strict';

/* eslint-disable no-console */

const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const url = require('url');
const DiscordRPC = require('discord-rpc');
const https = require('https');
const fs = require('fs');
const Zip = require('adm-zip');

let checkForUpdatesInterval;
let newVersion = '0.0.0';
let currentVersion = '0.0.0';
try {
  currentVersion = JSON.parse(fs.readFileSync(`${__dirname}/pokeclicker-master/docs/package.json`).toString()).version;
} catch (e) {}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    titleBarStyle: 'hidden',
    icon: __dirname + '/icon.ico',
    minWidth: 300,
    minHeight: 200,
    webPreferences: {
      webSecurity: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(`file://${__dirname}/pokeclicker-master/docs/index.html`)

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

/*
DISCORD STUFF
*/


// Set this to your Client ID.
const clientId = '733927271726841887';

// Only needed if you want to use spectate, join, or ask to join
DiscordRPC.register(clientId);

const rpc = new DiscordRPC.Client({ transport: 'ipc' });
const startTimestamp = new Date();

async function setActivity() {
  if (!rpc || !mainWindow) {
    return;
  }

  let caught = 0;
  let shiny = 0;
  let attack = 0;

  try {
    caught = await mainWindow.webContents.executeJavaScript('App.game.party.caughtPokemon.length');
    shiny = await mainWindow.webContents.executeJavaScript('App.game.party.shinyPokemon.length');
    attack = await mainWindow.webContents.executeJavaScript('App.game.party.caughtPokemon.reduce((sum, p) => sum + p.attack, 0)');
  } catch (e) {
    console.log('Something went wrong, could not gather data');
  }

  // You'll need to have snek_large and snek_small assets uploaded to
  // https://discord.com/developers/applications/<application_id>/rich-presence/assets
  rpc.setActivity({
    details: `Shinies ${shiny}/${caught} ✨`,
    state: `Total Attack: ${attack.toLocaleString('en-US')}`,
    // largeImageKey: 'image_name',
    // largeImageText: 'text when hovered',
    // smallImageKey: 'image_name',
    // smallImageText: 'text when hovered',
    instance: false,
  });
}

rpc.on('ready', () => {
  setActivity();

  // activity can only be set every 15 seconds
  setInterval(() => {
    setActivity();
  }, 15e3);
});

rpc.login({ clientId }).catch(console.error);

/*
UPDATE STUFF
*/
const isNewerVersion = (version) => {
  return version.localeCompare(currentVersion, undefined, { numeric: true }) === 1;
}

const downloadUpdate = () => {
  const file = fs.createWriteStream('update.zip');
  const request = https.get('https://codeload.github.com/pokeclicker/pokeclicker/zip/master', res => {
    res.pipe(file).on('finish', () => {
      const zip = new Zip('update.zip');
  
      var dir = `${__dirname}/data`;

      if (!fs.existsSync(dir)){
          fs.mkdirSync(dir);
      }

      const extracted = zip.extractEntryTo('pokeclicker-master/docs/', `${__dirname}`, true, true);

      if (!extracted) {
        return downloadUpdateFailed();
      }

      currentVersion = newVersion;
      startUpdateCheckInterval();

      const userResponse = dialog.showMessageBoxSync(mainWindow, {
        title: 'PokeClicker - Update success!',
        message: `Successfully updated,\nwould you like to reload the page now?`,
        icon: `${__dirname}/icon.ico`,
        buttons: ['Yes', 'No'],
        noLink: true,
      });

      if (userResponse == 0){
        mainWindow.loadURL(`file://${__dirname}/pokeclicker-master/docs/index.html`)
      }
    });
  }).on('error', (e) => {
    // TODO: Update download failed
    console.error('update download failed.', e);
  });
}

const downloadUpdateFailed = () => {
  const userResponse = dialog.showMessageBoxSync(mainWindow, {
    type: 'error',
    title: 'PokeClicker - Update failed!',
    message: `Failed to download or extract the update,\nWould you like to retry?`,
    icon: `${__dirname}/icon.ico`,
    buttons: ['Yes', 'No'],
    noLink: true,
  });

  if (userResponse == 0) {
    downloadUpdate();
  }
}

const checkForUpdates = () => {
  const request = https.get('https://raw.githubusercontent.com/pokeclicker/pokeclicker/master/package.json', res => {
    let body = '';

    res.on('data', d => {
      body += d;
    });

    res.on('end', () => {
      let data = {version:'0.0.0'};
      try {
        data = JSON.parse(body);
        newVersion = data.version;
        const newVersionAvailable = isNewerVersion(data.version);

        if (newVersionAvailable) {
          // Stop checking for updates
          clearInterval(checkForUpdatesInterval);
          // Check if user want's to update now
          shouldUpdateNowCheck();
        }
      }catch(e) {}
    });
  
  }).on('error', (e) => {
    // TODO: Update download failed
    console.warn('Couldn\'t check for updated version, might be offline..');
  });
}

const shouldUpdateNowCheck = () => {
  const userResponse = dialog.showMessageBoxSync(mainWindow, {
    title: 'PokeClicker - Update available!',
    message: `There is a new update available (v${newVersion}),\nWould you like to download it now?\n\n`,
    icon: `${__dirname}/icon.ico`,
    buttons: ['Update Now', 'Remind Me', 'No (disable check)'],
    noLink: true,
  });
  
  switch (userResponse) {
    case 0:
      downloadUpdate();
      break;
    case 1:
      // Check again in 1 hour
      setTimeout(shouldUpdateNowCheck, 36e5)
      break;
    case 2:
      console.log('Disabled, stop checking for updates');
      break;
  }
}

const startUpdateCheckInterval = (run_now = false) => {
  // Check for updates every hour
  checkForUpdatesInterval = setInterval(checkForUpdates, 36e5)
  if (run_now) checkForUpdates();
}

startUpdateCheckInterval(true);
