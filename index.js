var async = require('async');
var bodyParser = require('body-parser');
var crypto = require('crypto');
var express = require('express');
var line = require('@line/bot-sdk');
var NCMB = require("ncmb");
// var request = require('request');

var myNCMB =
    new NCMB(process.env.NCMB_APPKEY, process.env.NCMB_CLIKEY);

var app = express();
app.set('port', (process.env.PORT || 5000));
app.use(bodyParser.urlencoded({extended: true}));  // JSONの送信を許可
app.use(bodyParser.json());                        // JSONのパースを楽に（受信時）

// 買い物リスト
app.post('/shopping', function(req, res) {
    async.waterfall([
            validateSignatureTask(req, process.env.CHANNEL_SECRET),
            checkTextMessageTask(req),
            getTmpDataTask('Shopping'),
            shoppingMainTask(req.body['events'][0]['message']['text'])
        ],
        replyCallback(req.body['events'][0]['replyToken'], process.env.ACCESS_TOKEN)
    );
    res.send();
});

// NCMB上のデータを取得する
function getTmpDataTask(className) {
    return function(next) { // get tmpData
        var MyClass = myNCMB.DataStore(className);
        MyClass.fetchAll()
            .then(function(results){
                console.log('fetchAll success');
                console.log(JSON.stringify(results));
                next(null, results);
            })
            .catch(function(err){
                console.log('fetchAll failed');
                next('fetchAll failed:' + JSON.stringify(err));
            });
    }
}

// メッセージに応じてメイン処理を実行
function shoppingMainTask(text) {
    return function(fetchResults, next) {
        console.log('shoppingMainTask start');
        if(text == '見せて'){
            var ret = [];
            if(fetchResults.length == 0){
                ret.push('買い物リストには何もないよ');
            } else {
                ret.push('買い物リストだよ');
                ret.push(fetchResults.map(elem => elem['item']).join('\n'));
            }
            next(null, ret);
        } else {
            var Shopping = myNCMB.DataStore('Shopping');
            var reqLine = text.split(/[\s]/, 2);
            console.log(reqLine);
            if(reqLine[0] == '欲しい'){
                new Shopping().set('item', reqLine[1])
                    .save()
                    .then(function(data){
                        console.log('save success');
                        next(null, ['「' + reqLine[1] + '」を追加したよ']);
                    })
                    .catch(function(err){
                        console.log('save failed');
                        next('save failed:' + JSON.stringify(err));
                    })
            }else if(reqLine[0] == '買った'){
                var deleteTarget = fetchResults.find(result => result['item'] == reqLine[1]);
                if(deleteTarget){
                    var shopping = new Shopping();
                    shopping.set('objectId', deleteTarget['objectId'])
                        .delete()
                        .then(function(data){
                            console.log('delete success');
                            next(null, ['「' + reqLine[1] + '」を削除したよ']);
                        })
                        .catch(function(err){
                            console.log('delete failed');
                            next('delete failed:' + JSON.stringify(err));
                        })
                }else{
                    console.log('delete unhit');
                    next(null, ['「' + reqLine[1] + '」はリストにないよ']);
                }
            }else{
                console.log('unknown text');
                next(null, ['ちょっとよくわからない']);
            }
        }
    }
}

app.listen(app.get ('port'), function() {
    console.log('Node app is running');
});

// 署名検証タスク
function validateSignatureTask(request, secret) {
    return function(next) {
        if (!validateSignature(request, secret)) {
            next('invalid signature');
        }else{
            next();
        }
    }
}

// 署名検証
function validateSignature(request, secret) {
    return request.headers['x-line-signature'] == crypto.createHmac('SHA256', secret)
        .update(new Buffer(JSON.stringify(request.body), 'utf8')).digest('base64');
}

// テキストか否か判定するタスク
function checkTextMessageTask(request) {
    return function(next) {
        if (request.body['events'][0]['type'] != 'message' ||
            request.body['events'][0]['message']['type'] != 'text') {
            next('request is not text');
        } else {
            next();
        }
    }
}

// 返信メッセージを作成、送信するコールバック
function replyCallback(replyToken, accessToken) {
    return function(error, result) {
        console.log('callback start');
        console.log(error);
        console.log(result);
        if(error){
            console.log(error);
            return;
        }
        var client = new line.Client({
            channelAccessToken: accessToken
        });
        var message = [];
        result.forEach(function(elem){
            message.push({
                type: 'text',
                text: elem
            })
        });
        console.log(replyToken);
        console.log(message);
        client.replyMessage(replyToken, message)
            .then(() => {
                // console.log('reply success: ' + JSON.stringify(message));
            })
            .catch((err) => {
                console.log('reply failed: ' + err);
            });
    }
}
