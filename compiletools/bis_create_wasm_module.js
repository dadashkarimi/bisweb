#!/usr/bin/env node

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


// -----------------------------------------------------------------
// Header and requirements for node.js
'use strict';



// -----------------------------------------------------------------
// Create command line
// -----------------------------------------------------------------
const program=require('commander');
const genericio=require('../js/core/bis_genericio.js');
const fs=require('fs');


var help = function() {
    console.log('\nThis program creates the biswasmmodule.js file\n');
};

program.version('1.0.0')
    .option('-i, --input  <s>','input .wasm file')
    .option('-o, --output  <s>','output js file wrapper for wasm')
    .on('--help',function() {
            help();
    })
    .parse(process.argv);

if (program.output===null || program.input===null) {
    help();
    process.exit();
}

var getTime=function(nobracket=0) {
    //    http://stackoverflow.com/questions/7357734/how-do-i-get-the-time-of-day-in-javascript-node-js

    var date = new Date();

    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;

    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;

    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;

    if (nobracket===0)
        return  "[" + hour + ":" + min + ":" + sec +"]";
    return  hour + ":" + min + ":" + sec;
};

var getDate=function(sep="_") {
    //    http://stackoverflow.com/questions/7357734/how-do-i-get-the-time-of-day-in-javascript-node-js

    var date = new Date();
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;
    return  year+sep+month+sep+day;
};


console.log('++++ Raw Binary WASM Filename=',program.input);
let d=null;
try {
    d=fs.readFileSync(program.input);
} catch(e) {
    console.log('Failed to read data',e);
    process.exit(1);
}

let arr=new Uint8Array(d);
//console.log("++++ RAW Binary WASM Array length=",arr.length);
let str=genericio.tozbase64(arr);

//    console.log('++++ BisWASM loaded as zbase-64 string, length=',biswebpack.length);

let a=getDate("/");
let b=getTime(1);

let output_text=`


(function () {

    const biswebpack= { binary: "${str}", date : "${a}, ${b}" };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = biswebpack;
    } else {
        window.biswebpack=biswebpack;
    }
})();
`;
        
console.log(`++++ Writing webpack-wasm module to ${program.output}`);
fs.writeFileSync(program.output,output_text);

process.exit(0);
