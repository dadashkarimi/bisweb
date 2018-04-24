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

"use strict";

/*jshint browser: true*/
/*jshint undef: true, unused: true */

const $=require('jquery');
const bisdate=require('bisdate.js').date;

let inelectron=false;
if (typeof (window.BISELECTRON) !== "undefined") {
    inelectron=true;
}


let createIndex=function(obj) {
	
    var menu=$("#bismenuparent");
    var container=$("#bisslides");
    var indicators=$(".carousel-indicators");
    
    menu.empty();

    let bb=$(`<div align="center" style="padding:15px;  left:90vw; top:90vh; border-radius:30px;background-color:#884400; z-index:5000; position: absolute; color:#ffffff">
	     Version: ${bisdate}</div>`);

    $('body').append(bb);
    container.empty();
    indicators.empty();
    
    var keys=Object.keys(obj);
    var max=keys.length;
    
    for (var i=0;i<max;i++) {
	var elem=obj[keys[i]];
	var title=elem.title;
	var url='./'+elem.url+'.html';
	var description=elem.description;
	var picture=elem.picture;
	var electrononly=elem.electrononly || false;
	
	if ( inelectron === true ||
	     (inelectron === false && electrononly===false)) {
	    
	    var cname="";
	    if (i===0)
		cname=" active";
	    
	    var a='<div class="item'+cname+'">'+
		'<a href="'+url+'" target="_blank"><img src="'+picture+'">'+
		'<div class="carousel-caption">'+description+
		'</div>'+
		'</div>';
	    container.append($(a));
	    
	    menu.append($('<li><a  href="'+url+'" target="_blank" role="button">'+
			  title+'</a></li>'));
	    
	    var b='<li data-target="#mycarousel" data-slide-to="'+i+'"';
	    if (i===0)
		b+='class="active"';
	    b+="></li>";
	    indicators.append($(b));
	}
    }
};
    
let parsejson = function(text) {
    
    let obj;
    try {
	obj=JSON.parse(text);
    } catch(e) {
	obj=null;
	console.log('Failed to parse JSON');
	return;
    }
    
    if (obj!==null) {
	createIndex(obj.tools);
    }

    // Remove all previous alerts -- only one is needed
    
    let parent = $("#bisslides");
    let msg=`<B>These applications are still in 'alpha' (development) stage. Use with care.</B>`;
    
    let w = $(`<div class="alert alert-info alert-dismissible" role="alert"  style="position:absolute; top:70px; left:10px; z-index:100">
	      <button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>${msg}
	      </div>`);
    parent.append(w);
    w.alert();
    setTimeout(function () {
	$('.alert-info').remove();
    }, 10000);
    
    
    $('.carousel').carousel({
	interval : 4000,
	wrap : true
    });
    //	$('.carousel').carousel('cycle');
    $('body').css({"background-color":"rgb(28,45,64)"});
};
    
let readtextdata = function (url, loadedcallback, errorcallback) {

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'text';

    xhr.onload = function () {
        if (this.status == 200) {
            loadedcallback(xhr.response, url);
        } else {
            errorcallback('failed toread ' + url);
        }
        return false;
    };

    xhr.onerror = function () {
        errorcallback('Failed to get url=' + url);
    };

    xhr.send();
    return false;

};

class ApplicationSelectorElement extends HTMLElement {


    
    connectedCallback() {
	readtextdata('images/tools.json',parsejson,console.log);
    }
}

window.customElements.define('bisweb-applicationselector', ApplicationSelectorElement);

 