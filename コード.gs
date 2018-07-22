var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
var SHEET = {
  CONFIG: 'config',
  EVENT : 'event_data',
  LOG   : 'log'
};
var STATUS = {
  SUCCESS: 'SUCCESS',
  FAILED : 'FAILED'
};

var MAINTENANCE = false;

var CHANNEL_ACCESS_TOKEN = spreadsheet.getSheetByName(SHEET.CONFIG).getRange('B4').getValue(); 
//var USER_ID = spreadsheet.getSheetByName(SHEET.CONFIG).getRange('B5').getValue();  push通知の場合のみ使用、テスト用なので自分宛に送信
var LINE_BOT_API_URI = 'https://api.line.me/v2/bot/message/reply';
var ERROR_MESSAGE_RECIPIENT = spreadsheet.getSheetByName(SHEET.CONFIG).getRange('B6').getValue(); 


var MESSAGE = {
  ERROR      : 'エラーが発生しました。\nしばらく時間をおいてもダメな場合は@nagahiro0918 (https://twitter.com/nagahiro0918)にご連絡をお願いします。',
  MAINTENANCE: 'メンテナンス中です。\nメンテナンス情報については、@nagahiro0918 (https://twitter.com/nagahiro0918)をご参照ください。'
};
  
// 関数定義
function reloadRss() {
  spreadsheet.getSheetByName(SHEET.CONFIG).getRange('B2').setValue(new Date());
};

function createMessage(messageText) {
  if(MAINTENANCE)
    return 'メンテナンス中です。\nメンテナンス情報については、@nagahiro0918 (https://twitter.com/nagahiro0918)をご参照ください。';
  
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

/* フリープランの場合は使用不可
function pushMessage() {
  var postData = {
    'to': USER_ID,
    'messages': [{
      'type': 'text',
      'text': createMessage()
    }]
  };
  var response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', createOptions(postData));
};
*/

function doPost(e) {
  var event = JSON.parse(e.postData.contents).events[0];
  // 基本的に友だち追加、解除の場合を想定
  if(event.type !== 'message') {
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
        message = 'その他';
        break;
    }
    logToSheet(status, event, message);
    return;
  }
  
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

function createPostData(replyToken, event) {
  var message;
  if(typeof event.message.text !== 'undefined')
    message = createMessage(event.message.text);

  var postData;
  if(typeof message !== 'undefined') {
    postData = {
      'replyToken' : replyToken,
      'messages' : [{
        'type' : 'text',
        'text' : message
      }]
    };
  } else {
    postData = {
      'replyToken' : replyToken,
      'messages' : [{
        "type": "template",
        "altText": "this is a carousel template",
        "template": {
          "type": "carousel",
          "columns": createCarouselColumns()
        }
      }]
    };
  }
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

function createCarouselColumns() {
  eventDatas = spreadsheet.getSheetByName(SHEET.EVENT).getRange('A2:M11').getValues();

  var carouselColumns = [];
  eventDatas.forEach(function(eventData) {
    if(eventData[0] === '')
      return carouselColumns;
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
  spreadsheet.getSheetByName(SHEET.LOG).appendRow([new Date(), status, eventLog, message]);
};
