var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
var SHEET = {
  CONFIG: spreadsheet.getSheetByName('config'),
  EVENT : spreadsheet.getSheetByName('event_data'),
  LOG   : spreadsheet.getSheetByName('log')
};
var STATUS = {
  SUCCESS: 'SUCCESS',
  FAILED : 'FAILED'
};

var MAINTENANCE = false;

var CHANNEL_ACCESS_TOKEN = SHEET.CONFIG.getRange('B4').getValue(); 
//var USER_ID = SHEET.CONFIG.getRange('B5').getValue();  push通知の場合のみ使用、テスト用なので自分宛に送信
var LINE_BOT_API_URI = 'https://api.line.me/v2/bot/message/reply';
var ERROR_MESSAGE_RECIPIENT = SHEET.CONFIG.getRange('B6').getValue(); 


var MESSAGE = {
  ERROR      : 'エラーが発生しました。\nしばらく時間をおいてもダメな場合は@nagahiro0918 (https://twitter.com/nagahiro0918)にご連絡をお願いします。',
  MAINTENANCE: 'メンテナンス中です。\nメンテナンス情報については、@nagahiro0918 (https://twitter.com/nagahiro0918)をご参照ください。'
};

// RSS取得用関数（トリガーで5分毎に実行）
function reloadRss() {
  SHEET.CONFIG.getRange('B2').setValue(new Date());
};

// メイン処理（Botにメッセージが来た場合の処理）
function doPost(e) {
  var event = JSON.parse(e.postData.contents).events[0];

  if(!needsResponse(event))
    return;
  
  try {
    var postData = createPostData(event.replyToken, event);
    UrlFetchApp.fetch(LINE_BOT_API_URI, createOptions(postData));

    logToSheet(STATUS.SUCCESS, event);
  } catch(error) {
    logToSheet(STATUS.FAILED, event, error.message); // エラーログ記録
    var errorMessageForMail = 'インフラ勉強会LINE Botでエラーが発生しました。\n' + new Date() + '\n' + error.message;
    GmailApp.sendEmail(ERROR_MESSAGE_RECIPIENT, '【インフラ勉強会】LINE Bot エラー通知', errorMessageForMail); // エラー発生通知

    // エラーが出た場合は、一応その旨をユーザーに送信しようとしてみる
    var postData = createPostData(event.replyToken, MESSAGE.ERROR);
    UrlFetchApp.fetch(LINE_BOT_API_URI, createOptions(postData));
  }
};

// イベントタイプによって、レスポンスが必要か判断する
function needsResponse(event) {

  if(event.type === 'message' || event.type === 'postback')
    return true;

  // 基本的に友だち追加、解除の場合を想定    
  var status;
  var message;
  switch(event.type) {
    case 'follow':
      status = STATUS.SUCCESS;
      message = '友だち追加';
      break;
    case 'unfollow':
      status = STATUS.SUCCESS;
      message = '友だち解除';
      break;
    default:
      status = STATUS.FAILED;
      message = '想定外のイベントタイプ';
      break;
  }
  logToSheet(status, event, message);
  return false;
}

function createMessage(messageText) {
  if(MAINTENANCE)
    return MESSAGE.MAINTENANCE;
  
  // イースターエッグ
  if(messageText.indexOf('ぬるぽ') !== -1)
    return 'ｶﾞｯ';
  if(messageText.indexOf('禊') !== -1)
    return "( っ'-')╮ =͟͟͞͞💩";
  if(messageText.indexOf('IE') === 0)
    return 'イエ' + Array(messageText.split('E').length).join('ー') + '！！';
  if(messageText.indexOf('ひかりあれ') !== -1)
    return 'インフラ勉強会にひかりあれ。';

  return;
};

function createPostData(replyToken, event) {
  var message;
  if(typeof event.message.text !== 'undefined')
    message = createMessage(event.message.text);

  var postData = {'replyToken' : replyToken};
  var messages = [];
  if(typeof message !== 'undefined') {
    messages.push({
      'type' : 'text',
      'text' : message
    });
  } else {
    messages.push({
      "type": "template",
      "altText": "this is a carousel template",
      "template": {
        "type": "carousel",
        "columns": createCarouselColumns()
      }
    });
  }
  postData.messages = messages;
  return postData;
};



function createOptions(postData) {
  var options = {
    'method' : 'post',
    'headers' : {
      'Content-Type' : 'application/json',
      'Authorization' : 'Bearer ' + CHANNEL_ACCESS_TOKEN
    },
    'payload' : JSON.stringify(postData)
  };
  return options;
};

function arraysToObjects(arrays) {
  var arrays = SHEET.EVENT.getRange('A1:M11').getValues();
  var header = arrays[0].map(formatForHeader);
  var objects = [];
  for(var i = 1; i < arrays.length; i++) {
    var object = {};
    arrays[i].forEach(function(element, index) {
      object[header[index]] = element;
    });
    objects.push(object);
  };
  return objects;
};

function formatForHeader(element) {
  return element.toLowerCase().replace(/\s+/g, "_");
};

function createCarouselColumns() {
  eventDatas = SHEET.EVENT.getRange('A2:M11').getValues();

  var carouselColumns = [];
  eventDatas.forEach(function(eventData) {
    if(eventData[0] === '')
      return;
    var carouserlColumn = {
      "title": omit(eventData[0], 40),
      "text": omit((eventData[12] + '\n' + eventData[1] + 'さん'), 60),
      "actions": [{
        "type": "uri",
        "label": "詳細",
        "uri": eventData[2]
      }]
    };
    carouselColumns.push(carouserlColumn);
  });
  return carouselColumns;
};

function omit(text, charLimit) {
  return text.length <= charLimit ? text : text.substr(0, charLimit - 1) + '…';
};

function logToSheet(status, eventLog, message) {
  var message = typeof message === 'undefined' ? '': message;
  SHEET.LOG.appendRow([new Date(), status, eventLog, message]);
};
