/*  LICENSE
 
 _This file is Copyright 2018 by the Image Processing and Analysis Group (BioImage Suite Team). Dept. of Radiology & Biomedical Imaging, Yale School of Medicine._
 
 BioImage Suite Web is licensed under the Apache License, Version 2.0 (the "License");
 
 - you may not use this software except in compliance with the License.
 - You may obtain a copy of the License at [http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)
 
 __Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.__
 
 ENDLICENSE */

/*global window,document,setTimeout,HTMLElement */

"use strict";

const bisweb_apputil = require("bisweb_apputilities.js");
const BisWebImage = require('bisweb_image');
const webutil = require('bis_webutil');
const webfileutil = require('bis_webfileutil');
const FastClick = require('fastclick');
const userPreferences = require('bisweb_userpreferences.js');
const $ = require('jquery');
const bisdbase = require('bisweb_dbase');
const genericio=require('bis_genericio');
const bootbox=require('bootbox');
const BisWebPanel = require('bisweb_panel.js');
const resliceImage = require('resliceImage');
const BisWebLinearTransformation = require('bisweb_lineartransformation.js');
//const BisWebHelpVideoPanel = require('bisweb_helpvideopanel');

const localforage=require('localforage');


const clipboard=localforage.createInstance({
    driver : localforage.INDEXEDDB,
    name : "BioImageSuiteWebClipboard",
    version : 1.0,
    storeName : "biswebclipboard",
    description : "BioImageSuite Web Clipboard",
});




/**
 * A Application Level Element that creates a Viewer Application using an underlying viewer element.
 *
 * @example
 *
 * <bisweb-viewerapplication
 *     bis-menubarid="#viewer_menubar"
 *     bis-painttoolid="#painttool"
 *     bis-consoleid="#bisconsole"
 *     bis-viewerid="#viewer"
 *     bis-viewerid2="#viewer">
 * </bisweb-viewerapplication>
 *
 * Attributes
 *     bis-menubarid : theid a <bisweb-topmenubar> element
 *     bis-painttoolid : the id of an optional  <bisweb-painttoolelement>
 *     bis-viewerid : the id of the underlying <bisweb-orthogonalviewer> or <bisweb-mosaicviewer> element
 *     bis-viewerid2 : the id of the second <bisweb-orthogonalviewer> element (must be for use as slave)
 *     bis-consoleid : the id of an optional <bisweb-console> element.
 *     bis-modulemanagerid : the id of an optional <bisweb-modulemanager> element that manages processing modules
 */
class ViewerApplicationElement extends HTMLElement {

    constructor() {
        super();
        this.syncmode = false;
        this.VIEWERS=[];
        this.num_independent_viewers = 0;
        this.saveState=null;
        this.applicationURL=webutil.getWebPageURL();
        this.applicationName=webutil.getWebPageName();
        console.log("App name=",this.applicationName,this.applicationURL);
        clipboard.setItem('appname',this.applicationName);
    }


    //  ---------------------------------------------------------------------------
    // Find the viewers ('bis-viewerid' and 'bis-viewerid2') and store them in t
    // this.VIEWERS
    // Also set this.num_independent_viewers appropriately
    //  ---------------------------------------------------------------------------
    findViewers() {

        const viewerid = this.getAttribute('bis-viewerid');
        const viewerid2 = this.getAttribute('bis-viewerid2') || null;

        this.VIEWERS = [document.querySelector(viewerid)];
        this.VIEWERS[0].setName('viewer1');
        if (viewerid2 !== null) {
            this.VIEWERS.push(document.querySelector(viewerid2));
            this.VIEWERS[1].setName('viewer2');
        }

        this.num_independent_viewers = this.VIEWERS.length;
        if (this.syncmode) {
            this.num_independent_viewers = 1;
            webutil.setAlertTop(130);
        }


    }

    // ---------------------------------------------------------------------------
    // Copy & Paste
    
    /** Get State as Object 
        @returns {object} -- the state of the element as a dictionary*/
    getElementState(storeImages=false) {

        let obj = {};
        for (let i=0;i<this.VIEWERS.length;i++) {
            let name=`viewer${i+1}`;
            let getimg=storeImages;
            if (i>=this.num_independent_viewers) {
                getimg=false;
            }
            obj[name]=this.VIEWERS[i].getElementState(getimg);
        }
        return obj;
    }
    
    /** Set the element state from a dictionary object 
        @param {object} state -- the state of the element */
    setElementState(dt=null,name="") {

        if (dt===null)
            return;

        let numviewers=this.VIEWERS.length;
        if (name==="overlayviewer" && this.applicationName!=="overlayviewer")
            numviewers=1;
        
        for (let i=0;i<numviewers;i++) {
            let name=`viewer${i+1}`;
            let elem=dt[name] || null;
            this.VIEWERS[i].setElementState(elem);
        }
        if (this.num_independent_viewers > 1) {
            this.VIEWERS[1].setDualViewerMode(this.VIEWERS[1].internal.viewerleft);
        }
    }

    
    /** store State in this.saveState , unless filename is not null, in which case save */
    storeState(saveImages=false) {
        this.saveState=this.getElementState(saveImages);
        return;
    }

    /** restore State from this.internal.saveState unless obj is not null
     * @param {Object} obj - if set then restore from this else from this.saveState
     */
    restoreState(obj=null,name=null) {

        let inp=obj || this.saveState;
        name = name || this.applicationName;
        
        if (inp) {
            return this.setElementState(inp,name);
        }
    }

    /** copy Viewer State to clipboard 
     * @param{number}  index - the viewer index (0 or 1)
     */
    copyViewer(index=0) {
        let st=this.VIEWERS[index].getElementState(true);
        clipboard.setItem('viewer',st).then( () => {
            console.log('copied viewer',index,'to clipboard');
        }).catch( (e) => {
            console.log(e);
        });
    }

    /** paste Viewer State from clipboard 
     * @param{number}  index - the viewer index (0 or 1)
     */
    pasteViewer(index=0) {
        clipboard.getItem('viewer').then( (st) => {
            console.log('Read state',st.length);
            this.VIEWERS[index].setElementState(st);
        }).catch( (e) => {
            console.log('paste error',e,e.stack);
        });
    }
    
    // ---------------------------------------------------------------------------
    // Reslice Code
    // ---------------------------------------------------------------------------
    resliceOverlay(modulemanager,index=0) {

        let img=this.VIEWERS[index].getimage();
        let ov =this.VIEWERS[index].getobjectmap();


        let dim=img.getDimensions();
        let spa=img.getSpacing();
        let dim2=ov.getDimensions();
        let spa2=ov.getSpacing();

        let linear=new BisWebLinearTransformation(0); 
        linear.setShifts(dim,spa,dim2,spa2);
        linear.setParameterVector([ 0,0,0,0,0,0],{ scale:true, rigidOnly:true });

        let mod=new resliceImage();
        mod.execute({
            input : ov,
            reference : img,
            xform : linear,
        }, {
            addgrid : false,
            interpolation : 3
        }).then(() => {
            let temp=mod.getOutputObject('output');
            this.VIEWERS[index].setobjectmap(temp, false);
        });
    }

    
    // ---------------------------------------------------------------------------
    // I/O Code
    // ---------------------------------------------------------------------------
    loadImage(fname, viewer = 0) {
        const self=this;

        
        const img = new BisWebImage();
        return new Promise( (resolve,reject) => {

            webutil.createAlert('Loading image from ' + genericio.getFixedLoadFileName(fname),'progress',30);
            setTimeout( () => {
                img.load(fname)
                    .then(function () {
                        webutil.createAlert('Image loaded from ' + img.getDescription());
                        self.VIEWERS[viewer].setimage(img);
                        resolve();
                    }).catch( (e) => { reject(e); });
            },10);
        });
    }

    loadOverlay(fname, viewer=0) {

        const self=this;
        return new Promise( (resolve,reject) => {
            let img = new BisWebImage();
            webutil.createAlert('Loading image from ' + genericio.getFixedLoadFileName(fname),'progress',30);
            setTimeout( () => {
                img.load(fname)
                    .then(function () {
                        webutil.createAlert('Objectmap loaded from ' + img.getDescription());
                        self.VIEWERS[viewer].setobjectmap(img, false);
                        resolve();
                    }).catch((e) => {
                        webutil.createAlert(e, true);
                        console.log(e.stack);
                        reject(e);
                    });
            },10);
        });
    }

    
    // Save Image
    // --------------------------------------------------------------------------------
    /** Save image from viewer to a file */
    saveImage(fname=null, viewerno = 0) {
        let img = this.VIEWERS[viewerno].getimage();
        bisweb_apputil.saveImage(img, fname, name);
    }

    getSaveImageInitialFilename(viewerno = 0) {
        let img = this.VIEWERS[viewerno].getimage();
        return img.getFilename();
    }

    
    /** Save image from viewer to a file */
    saveOverlay(fname, viewerno = 0) {

        let index = viewerno + 1;
        let img = this.VIEWERS[viewerno].getobjectmap();
        let name = "objectmap" + index +".nii.gz";
        bisweb_apputil.saveImage(img, fname, name);
    }

    getSaveOverlayInitialFilename(viewerno = 0) {

        let img = this.VIEWERS[viewerno].getobjectmap();
        return img.getFilename();
    }



    // ---------------------------------------------------------------------------
    // Advanced Transfer Tool
    // ---------------------------------------------------------------------------
    createAdvancedTransferTool(modulemanager,editmenu) {

        const self=this;
        let name='Advanced Transfer Tool';
        if (!modulemanager) {
            name='App State Manager';
        }

        let dual=false;
        if (this.num_independent_viewers >1) {
            dual=true;
        }
        
        let newdlg=new BisWebPanel(this.VIEWERS[0].getLayoutController(),
                                   {
                                       name : name,
                                       width :300,
                                       dual : dual,
                                   });

        var bbar=webutil.createbuttonbar({ parent: newdlg.getWidget(),
                                           css : { 'margin-top' : '10px' ,
                                                   'margin-left' : '4px' }
                                         });
        
        var bbar1=webutil.createbuttonbar({ parent: bbar,
                                            css : { 'margin-bottom' : '20px','width' : '100%'}
                                          });


        webutil.createbutton({ type : "default",
                               name : "Store State",
                               parent : bbar1,
                               css : { 'width' : '120px' },
                               callback : function() {
                                   self.storeState();
                               }
                             });
        
        webutil.createbutton({ type : "default",
                               name : "Retrieve State",
                               parent : bbar1,
                               css : { 'left': '140px',
                                       'width':'120px',
                                       'position':'absolute'
                                     },
                               callback : function() {
                                   self.restoreState();
                               }
                             });

        if (modulemanager) {
            if (this.num_independent_viewers >1) {

                var bbar0=webutil.createbuttonbar({ parent: bbar,
                                                    css : {
                                                        'margin-bottom' : '10px',
                                                        'width' : '100%',
                                                    }
                                                  });
                
                webutil.createbutton({ type : "success",
                                       name : "V1 &rarr; V2",
                                       parent : bbar0,
                                       css : { 'width' : '80px' },
                                       callback : function() {
                                           modulemanager.transferImages(0,1);
                                       }
                                     });
                
                webutil.createbutton({ type : "success",
                                       name : "V2 &rarr; V1",
                                       parent : bbar0,
                                       css : { 'position': 'absolute',
                                               'width' : '80px',
                                               'left': '90px'
                                             },
                                       callback : function() {
                                           modulemanager.transferImages(1,0);
                                       }
                                     });
                

                webutil.createbutton({ type : "success",
                                       name : "V1 &harr; V2",
                                       parent : bbar0,
                                       css : { 'position': 'absolute',
                                               'width' : '80px',
                                               'left': '180px'
                                             },
                                       callback : function() {
                                           modulemanager.swapImages();
                                       }
                                     });


                var bbar2=webutil.createbuttonbar({ parent: bbar,
                                                    css : { 'margin-bottom' : '10px',
                                                            'width' : '100%' }
                                                  });

                
                webutil.createbutton({ type : "info",
                                       name : "V2 Im &rarr; V1 Ov",
                                       parent : bbar2,
                                       css : { 'width' : '120px' },
                                       callback : function() {
                                           modulemanager.transferImageToOverlay(1,0);
                                       }
                                     });

                webutil.createbutton({ type : "info",
                                       name : "V1 Im &rarr; V2 Ov",
                                       parent : bbar2,
                                       css : { 'width' : '120px',
                                               'left'  : '140px',
                                               'position' : 'absolute',
                                             },
                                       callback : function() {
                                           modulemanager.transferImageToOverlay(0,1);
                                       }
                                     });

                var bbar3=webutil.createbuttonbar({ parent: bbar,
                                                    css : { 'margin-bottom' : '10px',
                                                            'width' : '100%' }
                                                  });

                
                webutil.createbutton({ type : "info",
                                       name : "V2 Ov &rarr; V1 Im",
                                       parent : bbar3,
                                       css : { 'width' : '120px' },
                                       callback : function() {
                                           modulemanager.transferOverlayToImage(1,0);
                                       }
                                     });

                webutil.createbutton({ type : "info",
                                       name : "V1 Ov &rarr; V2 Im",
                                       parent : bbar3,
                                       css : { 'width' : '120px',
                                               'left'  : '140px',
                                               'position' : 'absolute',
                                             },
                                       callback : function() {
                                           modulemanager.transferOverlayToImage(0,1);
                                       }
                                     });

            } else {
                webutil.createbutton({ type : "info",
                                       name : "Copy Image &rarr; Overlay",
                                       parent : bbar,
                                       css : { 'width' : '260px', 'margin-bottom': '10px' },
                                       callback : function() {
                                           modulemanager.transferImageToOverlay(0,0);
                                       }
                                     });

                webutil.createbutton({ type : "info",
                                       name : "Copy Overlay &rarr; Image",
                                       parent : bbar,
                                       css : { 'width' : '260px', 'margin-bottom': '10px' },
                                       callback : function() {
                                           modulemanager.transferOverlayToImage(0,0);
                                       }
                                     });
            }

            let bottom=webutil.createbuttonbar({ parent: bbar,
                                                 css : {'margin-top' : '20px',
                                                        'width' : '100%' }
                                               });
            webutil.createbutton({ type : "danger",
                                   name : "Undo Image",
                                   parent : bottom,
                                   css : { 'width' : '120px' },
                                   callback : function() {
                                       modulemanager.getAlgorithmController().undoImage(true);
                                   }
                                 });
            
            webutil.createbutton({ type : "warning",
                                   name : "Redo Image",
                                   parent : bottom,
                                   css : { 'width' : '120px', 'left': '140px', 'position' : 'absolute' },
                                   callback : function() {
                                       modulemanager.getAlgorithmController().undoImage(false);
                                   }
                                 });
        }
        webutil.createMenuItem(editmenu,'');
        webutil.createMenuItem(editmenu,name,function() {
            newdlg.show();
        });
    }
    
    // ---------------------------------------------------------------------------
    // Create the default File and Overlay Menus
    //  ---------------------------------------------------------------------------
    createFileAndOverlayMenus(menubar,painttoolid) {

        const self=this;
        let paintviewerno = self.VIEWERS.length - 1;

        
        // --------------------------------------------------------------------------
        // Callbacks for load image
        // -----------------------------------------------------------------------
        /** Callback to load the overlay image -- this is called from bisweb_painttol (if it exists)
         * @param {BisWebImage} vol - the objectmap to load
         */
        
        // -----------------------------------------------------------------------
        // Menus
        // -----------------------------------------------------------------------


        let fmenu = [0, 0], objmenu = [0, 0];
        let fmenuname = "File", objmenuname = 'Overlay';


        // Essentially bind self here
        let load_image=function(f,v) { return self.loadImage(f,v); };        
        let load_objectmap=function(f,v) { return self.loadOverlay(f,v); };

        //  ---------------------------------------------------------------------------
        // Internal Function to eliminate having a loop variable inside callbacks
        // JSHint calls this confusing semantics ... maybe it knows something
        //  ---------------------------------------------------------------------------
        let internal_create_menu=function(viewerno) {

            if (viewerno === 1) {
                fmenuname = 'Image2';
                objmenuname = 'Overlay2';
            }

            
            if (painttoolid !== null && viewerno === paintviewerno) {
                objmenuname = "Objectmap";
                if (viewerno === 1)
                    objmenuname = "Objectmap2";
            }
            
            // ----------------------------------------------------------
            // File Menu
            // ----------------------------------------------------------
            fmenu[viewerno] = webutil.createTopMenuBarMenu(fmenuname, menubar);
            
            webfileutil.createFileMenuItem(fmenu[viewerno], 'Load Image',
                                           function (f) {
                                               self.loadImage(f, viewerno);
                                           },
                                           { title: 'Load image',
                                             save: false,
                                             suffix: 'NII'
                                           });

            webfileutil.createFileMenuItem(fmenu[viewerno], 'Save Image',
                                           function (f) {
                                               self.saveImage(f, viewerno); },
                                           {
                                               title: 'Save Image',
                                               save: true,
                                               filters: "NII",
                                               suffix : "NII",
                                               initialCallback : (() => {
                                                   return self.getSaveImageInitialFilename(viewerno);
                                               })
                                           });
            
            
            webutil.createMenuItem(fmenu[viewerno], ''); // separator

            bisweb_apputil.createMNIImageLoadMenuEntries(fmenu[viewerno], load_image, viewerno);


            // ----------------------------------------------------------
            // Objectmap/Overlay Menu
            // ----------------------------------------------------------
            objmenu[viewerno] = webutil.createTopMenuBarMenu(objmenuname, menubar);

            let painttool = null;

            if (painttoolid !== null && viewerno === paintviewerno) {
                painttool = document.querySelector(painttoolid);
                
                painttool.createMenu(objmenu[viewerno]);

                const graphtool = document.createElement('bisweb-graphelement');
                webutil.createMenuItem(objmenu[viewerno], 'VOI Analysis',
                                       function () {
                                           graphtool.parsePaintedAreaAverageTimeSeries(self.VIEWERS[paintviewerno]);
                                       });

            } else {
                
                webfileutil.createFileMenuItem(objmenu[viewerno], 'Load Overlay',
                                               function (f) {
                                                   self.loadOverlay(f, viewerno);
                                               }, 
                                               { title: 'Load overlay', save: false, suffix: "NII" });
                
                webfileutil.createFileMenuItem(objmenu[viewerno], 'Save Overlay',
                                               function (f) {
                                                   self.saveOverlay(f, viewerno);
                                               },
                                               {
                                                   title: 'Save Overlay',
                                                   save: true,
                                                   filters: "NII",
                                                   suffix : "NII",
                                                   initialCallback : () => {
                                                       return self.getSaveOverlayInitialFilename(viewerno);
                                                   }
                                               });

                webutil.createMenuItem(objmenu[viewerno], ''); // separator

                
                webutil.createMenuItem(objmenu[viewerno], 'Clear Overlay',
                                       function () {
                                           self.VIEWERS[viewerno].clearobjectmap();
                                       });
                webutil.createMenuItem(objmenu[viewerno], ''); // separator
                webutil.createMenuItem(objmenu[viewerno], 'Reslice Overlay To Match Image',
                                       function () {
                                           self.resliceOverlay(viewerno);
                                       });
            }
            webutil.createMenuItem(objmenu[viewerno], ''); // separator

            bisweb_apputil.createBroadmannAtlasLoadMenuEntries(objmenu[viewerno], load_objectmap, viewerno);
        };

        // ---------------------------------------------------------------------
        // End of callback ... now the loop
        // ---------------------------------------------------------------------
        
        for (let viewerno = 0; viewerno < this.num_independent_viewers; viewerno++) {
            internal_create_menu(viewerno);
        }

        return fmenu[0];
    }

    // ---------------------------------------------------------------------
    // Electron default callbacks (load image from arguments) 
    // ---------------------------------------------------------------------
    
    parseElectronArguments() {

        const self=this;
        
        let load=function(fname,v,a) {

            let n=genericio.getFixedLoadFileName(fname);
            let ext=n.split(".").pop();
            if (ext==="biswebstate") {
                self.loadApplicationState(fname);
                return 1;
            } else {
                self.loadImage(fname,v,a);
                return 0;
            }
        };

        if (webutil.inElectronApp()) {
            let title = $(document).find("title").text();
            setTimeout(function () {
                window.BISELECTRON.ipc.send('arguments', title);
            }, 120);
            
            window.BISELECTRON.ipc.on('arguments-reply', function (evt, args) {
                window.BISELECTRON.ipc.send('ping', 'Arguments received: ' + args);
                let a=-1;
                if (args.length > 0) {
                    a=load(args[0], 0, false);
                }
                if (args.length > 1 && this.num_independent_viewers > 1 && a===0) {
                    load(args[1], 1, false);
                }
            });
        }
    }


    // ---------------------------------------------
    // create the help menu
    // ---------------------------------------------

    addOrientationSelectToMenu(hmenu,userPreferencesLoaded) {

        let orientSelect = function () {
            userPreferencesLoaded.then(() => {
                webutil.createRadioSelectModalPromise(`<H4>Select default orientation "on load"</H4><p>If RAS or LPS is elected then the images will be reoriented to Axial RAS or LPS on load.</p><HR>`,
                                                      "Close",
                                                      userPreferences.getImageOrientationOnLoad(),
                                                      [{ value: "RAS", text: "Axial RAS (SPM)" },
                                                       { value: "LPS", text: "Axial LPS (DICOM, BioImage Suite legacy)" },
                                                       { value: "None", text: "Leave as is" }]).then((m) => {
                                                           userPreferences.setImageOrientationOnLoad(m);
                                                           userPreferences.storeUserPreferences();
                                                       }).catch((e) => { console.log('Error ', e); });
            });
        };

        webutil.createMenuItem(hmenu, "Set Image Orientation On Load", orientSelect);

    }
    
    createHelpMenu(menubar,userPreferencesLoaded) {
        let hmenu = webutil.createTopMenuBarMenu("Help", menubar);

        let fn = (() => { this.welcomeMessage(userPreferencesLoaded,true) ;});
        
        webutil.createMenuItem(hmenu,'About this application',fn);
        
/*        let helpdialog = new BisWebHelpVideoPanel();
        const self=this;
        webutil.createMenuItem(hmenu, 'About Video',
                               function () {
                                   helpdialog.setLayoutController(self.VIEWERS[0].getLayoutController());
                                   helpdialog.displayVideo();
                               });*/
        webutil.createMenuItem(hmenu, ''); // separator
        
        this.addOrientationSelectToMenu(hmenu,userPreferencesLoaded);

        const consoleid = this.getAttribute('bis-consoleid') || null;
        if (consoleid !== null) {
            let console = document.querySelector(consoleid);
            if (console) {
                webutil.createMenuItem(hmenu, ''); // separator
                console.addtomenu(hmenu);
            }
        }

        if (webutil.inElectronApp()) {
            webutil.createMenuItem(hmenu, ''); // separator
            webutil.createMenuItem(hmenu, 'Show JavaScript Console',
                                   function () {
                                       window.BISELECTRON.remote.getCurrentWindow().toggleDevTools();
                                   });
            userPreferencesLoaded.then( () => {
                let z=parseFloat(userPreferences.getItem('electronzoom')) || 1.0;
                if (z<0.8 || z>1.25)
                    z=1.0;
                window.BISELECTRON.electron.webFrame.setZoomFactor(z);
            });
        }

        webfileutil.createFileSourceSelector(hmenu);
        webfileutil.createAWSBucketMenu(hmenu);

        return hmenu;
    }

    // ---------------------------------------------------------------------------
    // Extra Menu -- use this to attach functionality in derived classes
    // ---------------------------------------------------------------------------
    createExtraMenu(/*menubar*/) {
        return;
    }
    // ---------------------------------------------------------------------------
    // create and attach drag and drop controller
    // ---------------------------------------------------------------------------

    attachDragAndDrop() {

        const self=this;
        
        let HandleFiles = function (files, e) {
            let count = 0;
            if (self.num_independent_viewers > 1) {
                if (self.VIEWERS[0].getInsideViewer(e.offsetX))
                    count = 0;
                else
                    count = 1;
            }

            let ext=files[0].name.split(".").pop();
            if (ext==="biswebstate")
                self.loadApplicationState(files[0]);
            else
                self.loadImage(files[0], count, false);
        };
        webutil.createDragAndCropController(HandleFiles);
    }
    // ----------------------------------------------------------
    // Display Menu
    // ----------------------------------------------------------
    createDisplayMenu(menubar,editmenu) {

        const self=this;
        let gmenu = null;
        let extra='Show ';
        if (!editmenu) {
            gmenu=webutil.createTopMenuBarMenu("Display", menubar);
            extra='';
        }  else {
            gmenu=editmenu;
            webutil.createMenuItem(gmenu,'');
        }

        if (webutil.inElectronApp()) {
            webutil.createMenuItem(gmenu, 'Zoom 80%',
                                   function () {
                                       window.BISELECTRON.electron.webFrame.setZoomFactor(0.8);
                                       userPreferences.setItem('electronzoom',0.8,true);
                                   });
            webutil.createMenuItem(gmenu, 'Zoom 100%',
                                   function () {
                                       window.BISELECTRON.electron.webFrame.setZoomFactor(1.0);
                                       userPreferences.setItem('electronzoom',1.0,true);
                                   });
            webutil.createMenuItem(gmenu, 'Zoom 125%',
                                   function () {
                                       window.BISELECTRON.electron.webFrame.setZoomFactor(1.25);
                                       userPreferences.setItem('electronzoom',1.2,true); 
                                       
                                   });
            webutil.createMenuItem(gmenu,'');
        }

        if (this.num_independent_viewers > 1) {
            webutil.createMenuItem(gmenu, extra+'Both Viewers', function () { self.VIEWERS[1].setDualViewerMode(0.5); });
            webutil.createMenuItem(gmenu, extra+'Viewer 1 Only', function () { self.VIEWERS[1].setDualViewerMode(1.0); });
            webutil.createMenuItem(gmenu, extra+'Viewer 2 Only', function () { self.VIEWERS[1].setDualViewerMode(0.0); });
            webutil.createMenuItem(gmenu,'');
            self.VIEWERS[0].setViewerMode('left', 0.5);
            self.VIEWERS[1].setViewerMode('right', 0.5);
            webutil.createMenuItem(gmenu, 'Viewer 1 Info', function () { self.VIEWERS[0].viewerInformation(); });
            webutil.createMenuItem(gmenu, 'Viewer 2 Info', function () { self.VIEWERS[1].viewerInformation(); });
        } else {
            webutil.createMenuItem(gmenu, 'Viewer Info', function () { self.VIEWERS[0].viewerInformation(); });
        }
        
    }

    //  ---------------------------------------------------------------------------
    
    loadApplicationState(fobj) {

        const self=this;
        return new Promise((resolve, reject) => {
            genericio.read(fobj, false).then((contents) => {
                let obj = null;
                try {
                    obj=JSON.parse(contents.data);
                } catch(e) {
                    webutil.createAlert('Bad application state file '+contents.filename+' probably not a application state file ',true);
                    reject(e);
                }

                if (!obj.app) {
                    webutil.createAlert('Bad application state file '+contents.filename+' probably not a application state file ',true);
                    return;
                }

                self.restoreState(obj.params,obj.app);
                webutil.createAlert('Application state loaded from ' + contents.filename);
                resolve("Done");
            }).catch((e) => {
                console.log(e.stack,e);
                webutil.createAlert(`${e}`,true);});
        });
    }

    /** save parameters to a file
     */
    saveApplicationState(fobj) {

        const self=this;
        
        this.storeState(true);
        
        let output= JSON.stringify({
            "app" : self.applicationName,
            "params" : this.saveState,
        },null,4);

        fobj=genericio.getFixedSaveFileName(fobj,self.applicationName+".biswebstate");
        //        console.log('Fobj=',fobj);
        
        return new Promise(function (resolve, reject) {
            //            console.log('fobj=',fobj);
            genericio.write(fobj, output).then((f) => {
                resolve(f);
            }).catch((e) => { reject(e); });
        });
    }

    //  ---------------------------------------------------------------------------
    createEditMenu(menubar) {
        const self=this;
        let editmenu=webutil.createTopMenuBarMenu("Edit", menubar);
        if (this.num_independent_viewers > 1) {
            webutil.createMenuItem(editmenu, 'Copy Viewer 1', function () { self.copyViewer(0); });
            webutil.createMenuItem(editmenu, 'Paste Viewer 1', function () { self.pasteViewer(0); });
            webutil.createMenuItem(editmenu,'');
            webutil.createMenuItem(editmenu, 'Copy Viewer 2', function () { self.copyViewer(1); });
            webutil.createMenuItem(editmenu, 'Paste Viewer 2', function () { self.pasteViewer(1); });

        } else {
            webutil.createMenuItem(editmenu, 'Copy Viewer', function () { self.copyViewer(0); });
            webutil.createMenuItem(editmenu, 'Paste Viewer', function () { self.pasteViewer(0); });
        }


        return editmenu;
    }
    
    createApplicationMenu(bmenu) {

        const self=this;
        webutil.createMenuItem(bmenu,'');
        webfileutil.createFileMenuItem(bmenu,'Load Application State',
                                       function(f) {
                                           self.loadApplicationState(f);
                                       },
                                       { title: 'Load Application State',
                                         save: false,
                                         filters : [ { name: 'Application State File', extensions: ['biswebstate']}],
                                       }
                                      );
        


        webfileutil.createFileMenuItem(bmenu, 'Save Application State',
                                       function (f) {
                                           self.saveApplicationState(f);
                                       },
                                       {
                                           title: 'Save Application State',
                                           save: true,
                                           filters : [ { name: 'Application State File', extensions: ['biswebstate']}],
                                           suffix : "biswebstate",
                                           initialCallback : () => {
                                               return self.applicationName+".biswebstate";
                                           }
                                       });

        

        
        webutil.createMenuItem(bmenu,'');
        webutil.createMenuItem(bmenu, 'Restart Application',
                               function () {
                                   bootbox.confirm("Are you sure? You will lose all unsaved data.",
                                                   function() {
                                                       window.open(self.applicationURL,'_self');
                                                   }
                                                  );
                               });
        return bmenu;
    }

    //  ---------------------------------------------------------------------------
    
    parseQueryParameters() {

        // Here we check if there is any info we need on the query string
        let load=webutil.getQueryParameter('load') || '';
        let imagename=webutil.getQueryParameter('image') || '';

        if (load.length>0) {
            this.loadApplicationState(load);
        } else if (imagename.length>0) {
            this.loadImage(imagename);
        }
    }
                                

    // ---------------------------------------------------------------------------
    welcomeMessage(userPreferencesLoaded,force=false) {

        let show=force;

        userPreferencesLoaded.then( () => {
            webutil.aboutText().then( (msg) => {


                let forceorient=userPreferences.getImageOrientationOnLoad();
                let firsttime=userPreferences.getItem('showwelcome');
                if (firsttime === undefined)
                    firsttime=true;
                
                if (!force) {
                    if (forceorient !== 'None' || firsttime===true)
                        show=true;
                }

                if (!show)
                    return;
                
                let dlg=webutil.createmodal('Welcome to BioImage Suite Web');
                let body=dlg.body;
                
                let txt=msg;
                
                if (!webutil.inElectronApp() && firsttime===true) {
                    txt+=`<HR><H3>Some things you should
                know ...</H3><H4>File Save</H4> <p>Because this application is
                running inside a web browser, saving a file is performed by
                mimicking downloading a file. You should change the options
                inside your browser to allow you to specify the location of
                any file saved.</p> <p><EM>Chrome</EM>: See the section titled
                <B>Change download locations on the <a target="_blank"
                rel="noopener"
                href="https://support.google.com/chrome/answer/95759?co=GENIE.Platform%3DDesktop&hl=en&oco=1">following
                link</a> for instructions as to how to change the default
                download location. In particular you should <B> check the box
                next to "Ask where to save each file before
                downloading."</B></p> <p>For other browsers simply search for
                the words "Browsername select download location" on
                Google.</p>`;
                }
                
                if (forceorient!== "None") {
                    txt+=`<HR><H3>Forcing Image Orientation</H3><p>On load all images are currently <B> automatically reoriented to ${forceorient}</B> based on your user preferences. Select Help|Set Image Orientation On Load to change this.</p>`;
                }
                
                dlg.header.empty();
                dlg.header.append('<H3>Welcome to BioImage Suite Web</H3>');
                body.append($(txt));

                if (!force && forceorient==="None") {
                    let confirmButton = webutil.createbutton({ 'name': 'Do not show this next time', 'type': 'success' });
                    confirmButton.on('click', (e) => {
                        e.preventDefault();
                        dlg.dialog.modal('hide');
                        userPreferences.setItem('showwelcome',false,true);
                    });
                    dlg.footer.append(confirmButton);
                }

                dlg.dialog.modal('show');
            });
        }).catch( (e) => {
            console.log(e.stack,e);
        });
    }

    
    //  ---------------------------------------------------------------------------
    // Essentially the main function, called when element is attached to the page
    //  ---------------------------------------------------------------------------
    connectedCallback() {

        // -----------------------------------------------------------------------
        // Find other items
        // -----------------------------------------------------------------------

        const self = this;
        const menubarid = this.getAttribute('bis-menubarid');
        const painttoolid = this.getAttribute('bis-painttoolid') || null;
        const landmarkcontrolid=this.getAttribute('bis-landmarkcontrolid') || null;
        const managerid = this.getAttribute('bis-modulemanagerid') || null;

        this.findViewers();
        
        let userPreferencesLoaded = userPreferences.webLoadUserPreferences(bisdbase);
        userPreferencesLoaded.then(() => {
            userPreferences.storeUserPreferences();
        });


        let menubar = document.querySelector(menubarid).getMenuBar();
        
        let modulemanager = null;
        if (managerid !== null)  {
            modulemanager = document.querySelector(managerid) || null;
        }

        // ----------------------------------------------------------
        // Application Menu
        // ----------------------------------------------------------
        
        
        // ----------------------------------------------------------
        // Create the File and Overlay Menus
        // ----------------------------------------------------------
        let fmenu=this.createFileAndOverlayMenus(menubar,painttoolid);

        this.createApplicationMenu(fmenu);

        let editmenu=this.createEditMenu(menubar);
        this.createAdvancedTransferTool(modulemanager,editmenu);
        
        
        
        if (this.num_independent_viewers >1)
            this.createDisplayMenu(menubar,null);


        // ----------------------------------------------------------
        // Module Manager
        // ----------------------------------------------------------
        if (modulemanager)
            modulemanager.initializeElements(menubar, self.VIEWERS);

        if (this.num_independent_viewers <2 ) {
            this.createDisplayMenu(menubar, editmenu);
        }

        if (painttoolid !== null || landmarkcontrolid !==null) {

            let toolmenu = webutil.createTopMenuBarMenu('Tools', menubar);
            let p=Promise.resolve();
            if (painttoolid) {
                let painttool = document.querySelector(painttoolid);
                p=painttool.addTools(toolmenu);
            }
            if (landmarkcontrolid) {
                let landmarkcontrol=document.querySelector(landmarkcontrolid);
                p.then( () => {
                    if (painttoolid)
                        webutil.createMenuItem(toolmenu,'');
                    
                    webutil.createMenuItem(toolmenu,'Landmark Editor',function() {
                        landmarkcontrol.show();
                    });
                });
            }   
        }
        

        
        // ----------------------------------------------------------
        // Electron Arguments
        // ----------------------------------------------------------
        if (webutil.inElectronApp()) {
            this.parseElectronArguments();
        }

        // ----------------------------------------------------------
        // Optional extra tool menu
        // ----------------------------------------------------------
        this.createExtraMenu(menubar);
        
        // ----------------------------------------------------------
        // Drag and Drop
        // ----------------------------------------------------------
        this.attachDragAndDrop();

        // ----------------------------------------------------------
        // Console
        // ----------------------------------------------------------
        let hmenu=this.createHelpMenu(menubar,userPreferencesLoaded);


        // ----------------------------------------------------------------
        // Add help sample data option
        // ----------------------------------------------------------------
        const mode = this.getAttribute('bis-mode');

        if (mode==='overlay') {
            webutil.createMenuItem(hmenu, ''); // separator
            webutil.createMenuItem(hmenu, 'Load Sample Data',
                                   function () {
                                       let imagepath=webutil.getWebPageImagePath();
                                       let f=`${imagepath}/viewer.biswebstate`;
                                       self.loadApplicationState(f);
                                   });
        }


        // ----------------------------------------------------------
        // Mouse Issues on mobile and final cleanup
        // ----------------------------------------------------------
        new FastClick(document.body);
        
        if (this.num_independent_viewers > 1)
            self.VIEWERS[1].setDualViewerMode(0.5);

        //signal other modules waiting for top bar to render
        let mainViewerDoneEvent = new CustomEvent('mainViewerDone');
        document.dispatchEvent(mainViewerDoneEvent);

        webutil.runAfterAllLoaded( () => {
            this.parseQueryParameters();
            document.body.style.zoom =  1.0;
            this.welcomeMessage(userPreferencesLoaded,false);
        });

    }
}


module.exports = ViewerApplicationElement;
webutil.defineElement('bisweb-viewerapplication', ViewerApplicationElement);
