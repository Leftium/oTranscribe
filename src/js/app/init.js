/******************************************
             Initialisation
******************************************/

const $ = require('jquery');
let otrQueryParams = {};

import { watchFormatting, watchWordCount, initAutoscroll } from './texteditor';
import { inputSetup, getQueryParams, hide as inputHide } from './input';
import oldBrowserCheck from './old-browsers';
import languageSetup from './languages';
import { createPlayer, playerDrivers, getPlayer, isVideoFormat } from './player/player';
import { bindPlayerToUI, keyboardShortcutSetup } from './ui';
import { activateTimestamps, insertTimestamp, convertTimestampToSeconds } from './timestamps';
import { initBackup } from './backup';
import { exportSetup } from './export';
import importSetup from './import';
import viewController from './view-controller';

import {setEditorContents} from './texteditor';

export default function init(){
    initBackup();
    watchFormatting();
    languageSetup();
    activateTimestamps();
    exportSetup();
    importSetup();
    initAutoscroll();

    // this is necessary due to execCommand restrictions
    // see: http://stackoverflow.com/a/33321235
    window.insertTimestamp = insertTimestamp;
    
    keyboardShortcutSetup();

    viewController.set('about');

    // Gather query parameters into an object
    otrQueryParams = getQueryParams();

    // If the ?v=<VIDEO_ID> parameter is found in the URL, auto load YouTube video
    if ( otrQueryParams['v'] ){
        $('.start').removeClass('ready');
        createPlayer({
            driver: playerDrivers.YOUTUBE,
            source: "https://www.youtube.com/watch?v=" + otrQueryParams.v
        }).then((player) => {
            inputHide();
            viewController.set('editor');
            bindPlayerToUI();
            let timestamp = otrQueryParams['t']; 
            if ( timestamp ){
                // Is the timestamp in HH:MM::SS format?
                if ( ~timestamp.indexOf(":") ){
                    timestamp = convertTimestampToSeconds(timestamp);
                } 
                player.driver._ytEl.seekTo(timestamp);
            }
        });

    } else {

        if ( localStorageManager.getItem("oT-lastfile") ) {
            viewController.set('editor');
        }
        
    }

    $('.title').mousedown(() => {
        if (viewController.is('about')) {
            viewController.set('editor');
        } else {
            viewController.set('about');
        }
    });
    $('.settings-button').mousedown(() => {
        if (viewController.is('settings')) {
            viewController.set('editor');
        } else {
            viewController.set('settings');
        }
    });

}

function create (file) {
    const driver = isVideoFormat(file) ? playerDrivers.HTML5_VIDEO : playerDrivers.HTML5_AUDIO;
    createPlayer({
        driver: driver,
        source: window.URL.createObjectURL(file),
        name: file.name
    }).then(() => {
        bindPlayerToUI(file.name);
    });
}

// note: this function may run multiple times
function onLocalized() {
    let resetInput = inputSetup({
        create: create,
        createFromURL: url => {
		    createPlayer({
		        driver: playerDrivers.YOUTUBE,
		        source: url
		    }).then(() => {
                bindPlayerToUI();
		    });
        }
    });
    
    watchWordCount();

    var startText = document.webL10n.get('start-ready');
    $('.start')
        // .addClass('ready')
        .toggleClass('ready', !otrQueryParams.v)    // Show 'Loading...' text if a video is to be automatically initialized
        .off()
        .click(() => {
            viewController.set('editor');
        });
    
    $('.reset').off().on('click', () => {
        const player = getPlayer();
        resetInput();
        if (player) {
            player.destroy();
        }
    });
    
    oldBrowserCheck();
    // oT.input.loadPreviousFileDetails();
}

window.addEventListener('localized', onLocalized, false);

$(window).resize(function() {
    if (document.getElementById('media') ) {
        document.getElementById('media').style.width = oT.media.videoWidth();
    }
});


var markdown2Html, mdtsRE;

mdtsRE = /<t ms=(?<ms>\d+)>(?<m>\d\d):(?<s>\d\d)<\/t>/;

markdown2Html = function(markdown) {
  var groups, html, i, len, line, lines, m, matches, ms, results, s, seconds;
  lines = markdown.split('\n');
  results = [];
  for (i = 0, len = lines.length; i < len; i++) {
    line = lines[i];
    if (matches = line.match(mdtsRE)) {
      groups = matches.groups;
      // Convert timestamp to seconds
      m = parseInt(groups.m, 10);
      s = parseInt(groups.s, 10);
      ms = parseInt(groups.ms, 10);
      seconds = m * 60 + s + ms / 1000;
      line = line.replace(mdtsRE, `<span class="timestamp" data-timestamp="${seconds}">${groups.m}:${groups.s}</span>`);
    } else {
      // Ensure spacing preserved with non-breaking spaces.
      line = line.replace(/[ ]/g, '\u00a0');
      line = `${line}<br/>`;
    }
    results.push(line);
  }
  return html = results.join('\n');
};


function handleDragover (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop (e) {
    e.preventDefault();
    let dt = e.dataTransfer;
    let files = dt.files;

    let videoFile = null;
    let textFile = null;

    [...files].forEach(function(file) {
        console.log(file.type);
        if(file.type.match(/^video/)) {
            videoFile = file
        } else {
            textFile = file
        }
    });


    if(videoFile) {
        const player = getPlayer();
        if (player) {
            player.destroy();
        }
        create(videoFile);

        $('.topbar').removeClass('inputting');
        $('.input').removeClass('active');
        $('.sbutton.time').addClass('active');
        $('.text-panel').addClass('editing');
        $('.ext-input-field').hide();
        $('.file-input-outer').removeClass('ext-input-active');
    }

    if(textFile) {
        let reader = new FileReader();
        reader.onload = function(event) {
            let text = event.target.result
            // Convert from md if required
            let matches = textFile.name.match(/(.+?)(\.[^.]*$|$)/);
            if (matches[2] === '.md') {
                localStorage.setItem('basename', matches[1]);
                text = markdown2Html(text);
            } else {
                const otr = JSON.parse(text);
                text = otr.text;
            }

            setEditorContents(text);
        };
        reader.readAsText(textFile);
    }
}

document.body.addEventListener('dragover', handleDragover);
document.body.addEventListener('drop', handleDrop);

let textbox = document.getElementById("textbox");
textbox.addEventListener('keydown', function (e) {
    if (e.keyCode === 9) { // tab key
        e.preventDefault();  // this will prevent us from tabbing out of the editor
        let isShift = !!e.shiftKey;
        if (!isShift) {
            // now insert four non-breaking spaces for the tab key
            var editor = textbox
            var doc = editor.ownerDocument.defaultView;
            var sel = doc.getSelection();
            var range = sel.getRangeAt(0);

            var tabNode = document.createTextNode("\u00a0\u00a0\u00a0\u00a0");

            range.insertNode(tabNode);

            range.setStartAfter(tabNode);
            range.setEndAfter(tabNode); 
            sel.removeAllRanges();
            sel.addRange(range);
        } else {
            document.execCommand('delete', false, null);
            document.execCommand('delete', false, null);
            document.execCommand('delete', false, null);
            document.execCommand('delete', false, null);
        }

    }
    if (e.keyCode === 13) {
        e.preventDefault();

        let sel = document.getSelection()
        let node = sel.anchorNode
        let text = node.nodeValue
        let parent = node.parentNode

        if (parent != textbox) {
            text = parent.textContent
        }
        let indent = text.match(/^\s*/g)[0]

        document.execCommand('insertText', false, '\n' + indent);
    }
});

$(function() {
    viewController.set('editor');
});
