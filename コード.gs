var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
var SHEET = {
  CONFIG  : spreadsheet.getSheetByName('config'),
  EVENT   : spreadsheet.getSheetByName('event_data'),
  BOOKMARK: spreadsheet.getSheetByName('bookmark'),
  LOG     : spreadsheet.getSheetByName('log')
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

// RSS取得用（トリガーで5分毎に実行）
function reloadRss() {
  SHEET.CONFIG.getRange('B2').setValue(new Date());
};

// メイン処理（Botにメッセージが来た場合の処理）
function doPost(e) {
  var event = JSON.parse(e.postData.contents).events[0];
  
    switch(event.type) {
      case 'follow':
        logToSheet(STATUS.SUCCESS, event, '友だち追加');
        break;
      case 'unfollow':
        logToSheet(STATUS.SUCCESS, event, '友だち解除');
        break;
      case 'message':
        break;
      case 'postback':
        break;
        
      default: // 想定外のイベントタイプだが、通常運用には問題ないため、エラーメールは送信しない
        logToSheet(STATUS.FAILED, event, '想定外のイベントタイプ');
        break;
    }
  
  try {
    var responseContent = createResponseContent(event.message.text);
    var postData = createPostData(event.replyToken, responseContent);
    UrlFetchApp.fetch(LINE_BOT_API_URI, createOptions(postData));

    logToSheet(STATUS.SUCCESS, event);
  } catch(error) {
    logToSheet(STATUS.FAILED, event, error.message); // エラーログ記録
    if(MAINTENANCE) { // メンテナンス中はエラーがありえるため、アラートメールを飛ばさない
      var errorMessageForMail = 'インフラ勉強会LINE Botでエラーが発生しました。\n' + new Date() + '\n' + error.message;
      GmailApp.sendEmail(ERROR_MESSAGE_RECIPIENT, spreadsheet.getName() + ' エラー通知', errorMessageForMail); // エラー発生通知
    }

    // エラーが出た場合は、一応その旨をユーザーに送信しようとしてみる
    var postData = createPostData(event.replyToken, MESSAGE.ERROR);
    UrlFetchApp.fetch(LINE_BOT_API_URI, createOptions(postData));
  }
};

// ポストバック時の処理を考える
function processForPostback() {
  var bookmarkDataArrays = SHEET.BOOKMARK.getRange('A1:B11').getValues();
  var bookmarkDatas = arraysToObjects(bookmarkData.slice(1), bookmarkDataArrays[0]);
  
}

// イベントタイプによって、レスポンスが必要か判断する
function needsResponse(eventType) {
  return eventType === 'message' || eventType === 'postback';
};

// 応答するデータを作成
// テキストかカルーセルオブジェクト
function createResponseContent(messageText) {
  if(MAINTENANCE)
    return MESSAGE.MAINTENANCE;

  var messageText = typeof messageText === 'undefined' ? '': messageText;
  // イースターエッグ
  if(messageText.indexOf('ぬるぽ') !== -1)
    return 'ｶﾞｯ';
  if(messageText.indexOf('禊') !== -1)
    return "( っ'-')╮ =͟͟͞͞💩";
  if(messageText.indexOf('IE') === 0)
    return 'イエ' + Array(messageText.split('E').length).join('ー') + '！！';
  if(messageText.indexOf('ひかりあれ') !== -1)
    return 'インフラ勉強会にひかりあれ。';
  
  if(messageText === '今日のイベント')
    return createCarouselColumns(true);
  
  // 通常の直近データを返す
  return createCarouselColumns(false);
};

// カルーセルデータの作成（ただしイベントデータがない場合はテキストで返す）
function createCarouselColumns(todayOnlyFlg) {
  var eventDataArrays = SHEET.EVENT.getRange('A1:N11').getValues();
  var eventDatas = arraysToObjects(eventDataArrays.slice(1), eventDataArrays[0]);
  // todayOnlyFlgがtrueの場合、データが空白ではない、かつ、当日のデータ
  // todayOnlyFlgがfalseの場合、データが空白ではないデータ
  eventDatas = eventDatas.filter(function(eventData) {
    var dataIsBlank = eventData.title === '';
    var now = new Date();
    var eventDay = new Date(eventData.date);
    var todayEventFlg = now.getFullYear() === eventDay.getFullYear()
                     && now.getMonth()    === eventDay.getMonth()
                     && now.getDate()     === eventDay.getDate();
    return !dataIsBlank && (!todayOnlyFlg || todayEventFlg);
  });
  // 返すべきイベント情報がない場合
  if(eventDatas.length === 0)
    return '該当するイベント情報はありません。';

  var carouselColumns = eventDatas.map(function(eventData) {
    return {
      "title": omit(eventData.title, 40),
      "text": omit((eventData.date_and_time + '\n' + eventData.author + 'さん'), 60),
      "actions": [{
        "type": "uri",
        "label": "詳細",
        "uri": eventData.url
      }, {
        'type': 'postback',
        'label': 'ブックマーク追加',
        'data': 'add:' +  eventData.url
      }, {
        'type': 'postback',
        'label': 'ブックマーク解除',
        'data': 'cancel:' +  eventData.url
      }]
    };
  });
  return carouselColumns;
};

// ポストデータの作成
function createPostData(replyToken, content) {
  var postData = {'replyToken' : replyToken};
  var message;
  switch(typeof content) {
    case 'string':
      message = {
        'type' : 'text',
        'text' : content
      };
      break;
    default:
      message = {
        "type": "template",
        "altText": "this is a carousel template",
        "template": {
          "type": "carousel",
          "columns": content
        }
      };
      break;
  }
  postData.messages = [message];
  return postData;
};

// オプション関係の情報
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

// 二次元配列をヘッダーの要素名に格納することによって、オブジェクトの配列へ変換
function arraysToObjects(arrays, header) {
  header = header.map(formatForHeader);
  var objects = arrays.map(function(array) {
    var object = {};
    array.forEach(function(element, index) {
      object[header[index]] = element;
    });
    return object;
  });
 return objects;
};

// ヘッダーの文字を小文字にして、スペースがある場合は'_'に置換
// できればキャメルケースにしたいが、手間かかりそうなのでとりあえずスネークケース
function formatForHeader(element) {
  return element.toLowerCase().replace(/\s+/g, "_");
};

// 制限文字数を超える場合に、後ろに'…'を表示する
function omit(text, charLimit) {
  return text.length <= charLimit ? text : text.substr(0, charLimit - 1) + '…';
};

// ログをシートに書き出す
function logToSheet(status, eventLog, logMessage) {
  var logMessage = typeof logMessage === 'undefined' ? '': logMessage;
  SHEET.LOG.appendRow([new Date(), status, eventLog, logMessage]);
};
