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

'use strict';


const baseutils=require("baseutils");
const BisWebImage = require('bisweb_image.js');
const BaseModule = require('basemodule.js');
/**
 * blanks an image along 
 */
class ReorientImageModule extends BaseModule {
    constructor() {
        super();
        this.name = 'blankImage';
    }

    createDescription() {

        return {
            "name": "Reorient Image",
            "description": "This algorithm reorients an image to a fixed orientation",
            "author": "Xenios Papdemetris",
            "version": "1.0",
            "inputs": baseutils.getImageToImageInputs('Load the image to be blanked'),
            "outputs": baseutils.getImageToImageOutputs(),
            "buttonName": "Execute",
            "shortname" : "reornt",
            "params": [
                {
                    "name": "Orientation",
                    "description": "Output image orientation",
                    "priority": 1,
                    "advanced": false,
                    "gui": "dropdown",
                    "type": "string",
                    "fields": ["RAS", "LPS", "LAS"],
                    "restrictAnswer": ["RAS", "LPS", "LAS" ],
                    "varname": "orient",
                    "default": "RAS"
                },
                baseutils.getDebugParam(),
            ],
            
        };
    }

    directInvokeAlgorithm(vals) {
        let input = this.inputs['input'];

        console.log('oooo invoking: reorientImage with vals', JSON.stringify(vals));

        let debug=this.parseBoolean(vals.debug);

        if (debug) {
            console.log('-- input \n', input.getDescription(),'\n');
            console.log(input.getHeader().getDescription());
        }

        
        let dat=input.serializeToNII();
        let output=new BisWebImage();
        output.initialize();
        output.debug=debug;
        output.parseNII(dat.buffer,vals.orient);
        output.debug=false;
        this.outputs['output']=output;

        if (debug) {
            console.log('-- output \n', output.getDescription(),'\n');
            console.log(output.getHeader().getDescription());
        }

        return Promise.resolve();
    }


}

module.exports = ReorientImageModule;
