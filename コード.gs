var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
var SHEET = {
  CONFIG: 'config',
  EVENT : 'event_data',
  LOG   : 'log'
}
var STATUS = {
  SUCCESS: 'SUCCESS',
  FAILED : 'FAILED'
}

var MAINTENANCE = false;

var CHANNEL_ACCESS_TOKEN = spreadsheet.getSheetByName(SHEET.CONFIG).getRange('B4').getValue(); 
//var USER_ID = spreadsheet.getSheetByName(SHEET.CONFIG).getRange('B5').getValue();  push通知の場合のみ使用

var ERROR_MESSAGE = 'エラーが発生しました。\nしばらく時間をおいてもダメな場合は@nagahiro0918 (https://twitter.com/nagahiro0918)にご連絡をお願いします。';

// 関数定義
function reloadRss() {
  spreadsheet.getSheetByName(SHEET.CONFIG).getRange('B2').setValue(new Date());
}

function createMessage(messageText) {
  if(MAINTENANCE)
    return 'メンテナンス中です。\n情報については、@nagahiro0918 (https://twitter.com/nagahiro0918)をご参照ください。';
  
  if(typeof messageText !== 'undefined') {
    // イースターエッグ
    if(messageText.indexOf('ぬるぽ') !== -1)
      return 'ｶﾞｯ';
    if(messageText.indexOf('禊') !== -1)
      return "( っ'-')╮ =͟͟͞͞💩";
    if(messageText.indexOf('IE') === 0)
      return 'イエ' + Array(messageText.split('E').length).join('ー') + '！！';
    if(messageText.indexOf('ひかりあれ') !== -1)
      return 'ひかりあれ。';
  }

  // 本処理
  outlines = spreadsheet.getSheetByName(SHEET.EVENT).getRange('A2:A11').getValues();
  var message = '';
  for(i = 0; i < outlines.length; i++) {
    if(message.length != 0)
      message += '\n\n';
    message += outlines[i][0];
  }
  return message;
}

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
}
*/

function doPost(e) {
  var event = JSON.parse(e.postData.contents).events[0];
  try {
    var postData = createPostData(event.replyToken, createMessage(event.message.text));
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', createOptions(postData));

    logToSheet(STATUS.SUCCESS, event);
  } catch(error) {
    logToSheet(STATUS.FAILED, event, error.message);
    // エラーが出た場合は、一応その旨を送信しようとしてみる
    var postData = createPostData(event.replyToken, ERROR_MESSAGE);
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', createOptions(postData));
  }
}

function createPostData(replyToken, message) {
  var postData = {
    'replyToken' : replyToken,
    'messages' : [{
      'type' : 'text',
      'text' : message
    }]
  };
  return postData;
}

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
}

function logToSheet(status, eventLog, errorMessage) {
  var errorMessage = typeof errorMessage === 'undefined' ? '': errorMessage;
  spreadsheet.getSheetByName(SHEET.LOG).appendRow([new Date(), status, eventLog, errorMessage]);
}
