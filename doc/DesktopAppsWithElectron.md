[ELECTRON]: http://electron.atom.io/


# Developing with Electron 

[Electron][ELECTRON] was originally developed as a basis for GitHub's Atom
editor and went by the name "Atom-shell". It was then refactored into a
full-blown standalone platform for HTML/CSS/JS-based Desktop
Applications. The [Electron webpage][ELECTRON] is an excellent source of
documentation for this which we will not duplicate here. Instead, the focus
here is on ensuring that our multi-platform modules work with Electron as
well as command line node.js and browser-based setups.

__Note:__ As far as modules are concerned Electron is essentially
browser-plus. Most of the code will be used like in the browser but we will
use a "preload-injection" mechanism to add a finite number of node modules
that do not work in the browser. For those modules that are universal
(i.e. both node and browser) we will use the browser mechanism (via the
Universal modules defined above) to maintain maximum compatibility.

All the code in this section can be found in the [repository][REPO] under
``examples/electronmodule`` which is a slightly modified version of
``examples/universalmodule``.

---

## The Main Process

When electron starts it takes as a first argument a directory. In this directory it looks for a JSON-formatted configuration file called package.json. This takes the form:

    {
        "name" : "Application Name",
        "version" : "1.0",
        "main" : "biselectron.js"
    }

(You can look at the bisweb version of this file in [web/package.json](../web/package.json).)

The "main" field stores a pointer to the javascript file that will be
executed when the executable starts. This is the base or core process. This process then starts a second process (a renderer
process) by creating a RenderWindow object. This second process (and
potentially a third and fourth and fifth and ... if more BrowserWindows are
created) is effectively a packaged web browser. Let's now take a look at a simplified version of [the main electron file](../web/biselectron.js).

We first require some core modules:

     "use strict";
     const electron = require('electron');
     const path=require('path');
     const app=electron.app;  // Module to control application life.
     const BrowserWindow = electron.BrowserWindow;  // Module to create native browser window.

Next we store a reference to the main window of the application (`mainWindow`). Once this is created the app will not terminate
until this is set (back) to null to free the pointer to the window (once it is closed).

     let mainWindow=null;

This function creates the main window (using `index.html`)

     var createWindow=function() {

         let hidden='shown';
         let opts= {width: 600, height: 400};
         let fullURL='file://' + path.resolve(__dirname , 'index.html');

This is the key here -- this script `bispreload.js` is run __before__ the html file is loaded
and can include node-style requires even if the rest of the window
has no node integration (turned off below nodeIntegration:false). See the [section on the renderer process](#The-Renderer-Process) for more details.

         let preload=  path.resolve(__dirname, 'bispreload.js');

We next create the main window:

         mainWindow=new BrowserWindow({width: opts.width,
                       height: opts.height,
                       show: true,
                       webPreferences: {
                           nodeIntegration: false,
                           preload: preload,
                       },
                      });

We register callbacks using ES6-style arrow functions

         mainWindow.once('ready-to-show', () => { mainWindow.show(); });
         mainWindow.on('closed', () => { mainWindow = null;});

We load the URL to start

         mainWindow.loadURL(fullURL);
     };

The callbacks are copied straight from Electron examples:

     // Quit when all windows are closed.
     app.on('window-all-closed', function() {
         // On OS X it is common for applications and their menu bar
         // to stay active until the user quits explicitly with Cmd + Q
         if (process.platform !== 'darwin') {
             app.quit();
         }
     });

     // This method will be called when Electron has finished
     // initialization and is ready to create browser windows.
     app.on('ready', function() {
         createWindow();
     });

Most of the rest of the code is boilerplate, adapted from the Electron
examples. The only key change occurs in the creation of the BrowserWindow
and specifically the lines

    webPreferences: {
          nodeIntegration: false,
          preload: preload,
    },

which (1) supply a preload javascript file (we will look at this next) that
is loaded __before__ the HTML file and (2) disables node integration
(i.e. the _require_ function) for all JavaScript code that is loaded from
within the BrowserWindow. This ensures that we (i) _can use_ some node.js
code (through the preload script) and (ii) _we have maximum compatibility_
with code developed with the browser in mind as there no
node.js-symbols/functions in the global scope.

To run this code in development mode, first cd to the root directory of the source tree. Then ensure you have a valid build using:

    gulp build

Then start the electron process in BioImage Suite Web using

    electron web

This will open the file ``web/package.json`` and use this to determine the
initial script (biselectron.js). This will then instantiate a Browser
Window and load our familiar ``web/index.html`` file (or `viewer.html` if this was specified.) This is set by the
combination of the following two statements:

       let fullURL='file://' + path.resolve(__dirname , 'index.html');
       mainWindow.loadURL(fullURL);

The first resolves index.html using a ``file://`` style URL in global scope
and the second loads the URL.

If you want to start the viewer tool directly type (the full version `biselectron.js` parses the arguments to load a specific html file (in this case `viewer.html` instead of `index.html` if this is specified!)

    electron main viewer

---

## The Renderer Process

The renderer process is effectively (in our configuration) a localized web
browser that loads local HTML file and all associated JS/CSS files. The one
difference is the preload script which is loaded before the HTML and which
(again in our usage) access node.js style code. Here is our example preload
script [web/bispreload.js](../web/bispreload.js).

    /* global  window,Buffer,__dirname */
    "use strict";

    const electron= require('electron');
    const remote=electron.remote;

    window.BISELECTRON = {
        // ----------------------------------------------------
        // Add modules here
        // ----------------------------------------------------
        version : '1.0',
        bispath : __dirname,
        fs : require('fs'),
        zlib : require('zlib'),
        path : require('path'),
        os : require('os'),
        glob : require('glob'),
        ipc : electron.ipcRenderer,
        dialog : remote.require('electron').dialog,
        remote : remote,
        Buffer : Buffer,
    };

This is essentially defines a global object BISELECTRON (which is stored
explicitly as a member of the Browser's global window object). In this we
store references to key node.js modules that we would like to use
later. This include the core file-system modules (``fs``, ``path`` and
``zlib``) and the ``dialog`` sub-package which can be used to create System
File|Open and File|Save dialogs. Please note that all this functionality is
``name-spaced`` inside window.BISELECTRON and needs to explicitly retrieved
from there. We make heavy use of these packages in [bis_genericio.js](../js/core/bis_genericio.js), where we abstract file I/O -- see also the description in [BisWebJS.md](BisWebJS.md#A-quick-note-on-Electron)

A minor point is that the dialog package is a reference to an object of the
remote (base) process. Read the Electron documentation for more details of
why this is so. Here we will not worry about this distinction, instead we
will encapsulate the necessary code and not deal with this issue from here
on out.

---

## Electron File Dialogs

### Introduction

Unlike the Web-applications, in Electron we can initiate file dialogs programmatically. Here is an example of the file|Open dialog.

            window.BISELECTRON.dialog.showOpenDialog( null, {
                title: 'Select file to save image in',
                defaultPath : 'initial.jpg',
                filters : [ 
                    { name: 'JPEG Files', extensions: [ "jpeg","jpg","JPG"]},
                    { name: 'All Files', extensions: [ "*"]}
              ],
            }, function(filename) {
                if(filename) {
                    ... do something
                }
            });

Her is the same for file|Save

            window.BISELECTRON.dialog.showSaveDialog( null, {
                title: 'Select file to save image in',
                defaultPath : 'initial.jpg',
                filters : [ 
                    { name: 'JPEG Files', extensions: [ "jpeg","jpg","JPG"]},
                    { name: 'All Files', extensions: [ "*"]}
              ],
            }, function(filename) {
                if(filename) {
                    ... do something
                }
            });
        } 

### Specifying Filename Filters:

The filters in the Electron file dialogs are defined as arrays of dictionaries. Each dictionary has two elements

* name -- the name of the filter as a string
* extension -- an array of strings specifying the extensions __without the preceeding period (`.`)__

### Electron File Selection and the Module `bis_webutil`

BioImage Suite Web has a module [js/coreweb/bis_webutil](../js/coreweb/bis_webutil.js) which contains code to abstract many GUI operations. One particular function is `electronFileCallback` which can be used to show the above dialogs etc.

The code is below. The function takes two inputs

* electronopts -- a dictionary object with parameters
* callback -- the function to call with the selected filename as the argument

Here is the actual code:


        /** electron file callback function
        * @alias WebUtil.electronfilecallbackoptions
        * @param {object} opts - the electron options object -- used if in electron
        * @param {string} opts.title - if in file mode and electron set the title of the file dialog
        * @param {boolean} opts.save - if in file mode and electron determine load or save
        * @param {string} opts.defaultpath - if in file mode and electron use this as original filename
        * @param {string} opts.filter - if in file mode and electron use this to filter electron style
        * @param {function} callback - callback to call when done
        */
        electronFileCallback: function (electronopts, callback) {

We parse the options and ensure sane default values:

            electronopts = electronopts || {};
            electronopts.save = electronopts.save || false;
            electronopts.title = electronopts.title || 'Specify filename';
            electronopts.defaultpath = electronopts.defaultpath || '';
            electronopts.filters = electronopts.filters ||
                [{ name: 'All Files', extensions: ['*'] }];

If we are loading images, we can simply specify our filter as the string "NII" and this function takes care of this very common scenario:

            if (electronopts.filters === "NII")
                electronopts.filters = [
                    { name: 'NIFTI Images', extensions: ['nii.gz', 'nii'] },
                    { name: 'All Files', extensions: ['*'] },
                ];

Select which electron dialog to invoke (load or save)

            let cmd = window.BISELECTRON.dialog.showSaveDialog;
            if (!electronopts.save)
                cmd = window.BISELECTRON.dialog.showOpenDialog;

If the filter is the word "DIRECTORY" use the special call to electron.showOpenDialog below

            if (electronopts.filters === "DIRECTORY") {
                cmd(null, {
                    title: electronopts.title,
                    defaultPath: electronopts.defaultpath,
                    properties: ["openDirectory"],
                }, function (filename) {
                    if (filename) {
                        return callback(filename + '');
                    }
                });
            } else {

Else try to get a filename:

                cmd(null, {
                    title: electronopts.title,
                    defaultPath: electronopts.defaultpath,
                    filters: electronopts.filters,
                }, function (filename) {
                    if (filename) {
                        return callback(filename + '');
                    }
                });
            }
        };

Here are a couple of examples of calling this from various places. The following selects a directory and calls `clb(directoryname)`, when done.

        webutil.electronFileCallback({
            filters : "DIRECTORY",
            title : "Select Directory to store output files",
            },
        clb);


This is a call to save a transformation file:

            webutil.electronFileCallback({
                filename : initial_filename,
                title    : 'Select filename to save the transformation to',
                filters  :  [
                                { name: 'Transformation Files', extensions: [ "bisxform","matr","grd"]},
                                { name: 'All Files', extensions: [ "*"]}
                          ],
                save : true,
            },function(f) { 
                saveItem(f);  // this is a random function
            });

To load a transformation simply change `save:true` to `save:false` above.

The module `bis_webutil` has some other interesting functions such as:

     * createfilebutton
     * createMenuItem

These call `electronFileCallback` to handle file selection operations.