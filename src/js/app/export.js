const $ = require('jquery');
const Mustache = require('mustache');
const TurndownService = require('turndown').default;
const template = require('raw-loader!../../html/export-panel.ms');
import googleDriveSetup from './export-formats/google-drive';
import { getPlayer } from './player/player';
const sanitizeHtml = require('sanitize-html');
import { cleanHTML } from './clean-html';

function getTexteditorContents() {
    return document.querySelector('#textbox').innerHTML;
}

function getFilename() {
    return document.webL10n.get('file-name') + " " + (new Date()).toUTCString();
}

let exportFormats = {
    download: [],
    send: []
};

let html2Markdown = function(html) {
  var i, len, line, lines, markdown, options, results, turndownService;
  turndownService = new TurndownService();
  turndownService.escape = function(text) {
    return text;
  };
  turndownService.addRule('p', options = {
    filter: 'p',
    replacement: function(content, node, options) {
      // Replace non-breaking spaces with space
      content = content.replace(/\u00a0/g, ' ');
      return `\n${content}`;
    }
  });
  turndownService.addRule('timestamp', options = {
    filter: 'span',
    replacement: function(content, node, options) {
      var ms, timestamp;
      if (node.className === 'timestamp') {
        timestamp = node.dataset.timestamp;
        ms = timestamp.split('.').pop();
        return `<t ms=${ms}>${content}</t>`;
      } else {
        return content;
      }
    }
  });
  markdown = turndownService.turndown(html);
  lines = markdown.split('\n');
  results = [];
// We want blank lines between notes and timestamps, but
// keep consecutive timestamps to be tightly packed.
  for (i = 0, len = lines.length; i < len; i++) {
    line = lines[i];
    if (line.match(/^<t ms=/)) {
      line = `\n${line}<br>`;
    } else {
      line = line.replace(/\u00a0/g, ' ');
    }
    results.push(line);
  }
  markdown = results.join('\n');
  // Remove extra newlines between consecutive timestamps.
  return markdown = markdown.replace(/<br>\n\n/g, '<br>\n');
};



let turndownService = new TurndownService()
exportFormats.download.push({
    name: 'Markdown',
    extension: 'md',
    fn: (txt) => {
        const md = html2Markdown(txt);
        return md.replace(/\t/gm,"");
    }
});

exportFormats.download.push({
    name: 'Plain text',
    extension: 'txt',
    fn: (txt) => {
        const fullyClean = sanitizeHtml(txt, {
            allowedTags: [ 'p' ]
        });
        const md = turndownService.turndown( fullyClean );
        return md.replace(/\t/gm,"");
    }
});

exportFormats.download.push({
    name: 'oTranscribe format',
    extension: 'otr',
    fn: (txt) => {
        let result = {};
        result.text = txt.replace('\n','');
        const player = getPlayer();
        if (player){
            result.media = player.getName();
            result['media-time'] = player.getTime();
            // if (oT.media.ytEl) {
            //     result['media-source'] = oT.media._ytEl.getVideoUrl();
            // } else {
            //     result['media-source'] = '';
            // }
        } else {
            result.media = '';
            result['media-source'] = '';
            result['media-time'] = '';
        }
        return JSON.stringify(result);
    }
});

exportFormats.send.push({
    name: 'Google Drive',
    setup: function(cb) {
        this.checkGoogleAuth = googleDriveSetup(cb);
    },
    fn: function(opts) {
        this.checkGoogleAuth(opts);
    }
})

function generateButtons(filename) {
    
    const downloadData = exportFormats.download.map(format => {
        const clean = cleanHTML( getTexteditorContents() );
        const file = format.fn(clean);
        const blob = new Blob([file], {type: 'data:text/plain'});
        const href = window.URL.createObjectURL(blob);
        
        return {
            format: format,
            file: file,
            href: href,
            filename: getFilename()
        };
    });    

    if (checkDownloadAttrSupport() === false) {
        downloadData.forEach(format => {
            format.href = convertToBase64(format.file);
        });
    }    
  
    return Mustache.render(template, {
        downloads: downloadData
    });
    
}

export function exportSetup(){
    
    $('.textbox-container').click(function(e) {
        if(
            $(e.target).is('#icon-exp') ||
            $(e.target).is('.export-panel') ||
            $(e.target).is('.sbutton.export')
        ){
            e.preventDefault();
            return;
        }
        hideExportPanel();
    });    
    
    $(".export-panel").click(function(e) {
         e.stopPropagation();
    });
    
    $('.sbutton.export').click(function() {
        // document.querySelector('.container').innerHTML = downloadButtons;
        var origin = $('#icon-exp').offset();
        var right = parseInt( $('body').width() - origin.left + 25 );
        var top = parseInt( origin.top ) - 50;
        
        const filename = getFilename();
        const data = {
            text: document.querySelector('#textbox').innerHTML,
            filename: filename
        };
        
        $('.export-panel')
            .html(generateButtons(filename));

        exportFormats.send.forEach(format => {

            if (format.ready) {
                format.fn(data);
            } else {
                format.setup(() => {
                    format.ready = true;
                    setTimeout(() => {
                        format.fn(data)
                    }, 500);
                });
            }
        });

        $('.export-panel')
            .css({'right': right,'top': top})
            .addClass('active'); 
        
    });
}

function hideExportPanel(){
    $('.export-panel').removeClass('active');
}

function checkDownloadAttrSupport() {
    var a = document.createElement('a');
    return (typeof a.download != "undefined");
}

function convertToBase64(str) {
    return "data:application/octet-stream;base64," + btoa(str);
}
