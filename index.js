var async = require('async');
var bodyParser = require('body-parser');
var crypto = require('crypto');
var express = require('express');
var line = require('@line/bot-sdk');
var NCMB = require("ncmb");
// var request = require('request');

var linebotsNCMB =
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
            getTmpDataTask('shopping'),
            shoppingMainTask(req.body['events'][0]['message']['text'])
        ],
        replyCallback(req.body['events'][0]['replyToken'], process.env.ACCESS_TOKEN)
    );
    res.send();
});

// NCMB上のデータを取得する
function getTmpDataTask(className) {
    return function(next) { // get tmpData
        var MyClass = linebotsNCMB.DataStore(className);
        MyClass.fetchAll()
            .then(function(results){
                next(null, results);
            })
            .catch(function(err){
                next('fetchAll failed:' + JSON.stringify(err));
            });
    }
}

// メッセージに応じてメイン処理を実行
function shoppingMainTask(text) {
    return function(fetchResults, next) {
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
            var Shopping = linebotsNCMB.DataStore('Shopping');
            var saveList = [];
            var deleteList = [];
            var invalidList = [];
            // 改行を区切りとして配列化し、ついでに空要素を排除
            var reqArray = text.split(/[\n]/).filter(elem => elem);
            // 各行に対して、半角スペースを区切りとして1番目を命令、2番目を商品名として処理
            reqArray.forEach(function(elem){
                var reqLine = elem.split(/[\s]/, 2);
                if(reqLine[0] == '欲しい'){
                    new Shopping().set('item', reqLine[1])
                        .save()
                        .then(function(data){
                            saveList.push(reqLine[1]);
                        })
                        .catch(function(err){
                            next('save failed:' + JSON.stringify(err));
                        })
                }else if(reqLine[0] == '買った'){
                    var deleteTarget = fetchResults.find(result => result['ietm'] == reqLine[1]);
                    if(deleteTarget){
                        new Shopping().set('objectId', deleteTarget['objectId'])
                            .delete()
                            .then(function(data){
                                deleteList.push(reqLine[1]);
                            })
                            .catch(function(err){
                                next('delete failed:' + JSON.stringify(err));
                            })
                    }else{
                        invalidList.push(elem);
                    }
                }else{
                    invalidList.push(elem);
                }
            });
            var ret = [];
            if(saveList.length != 0){
                ret.push('【追加したもの】\n' + saveList.join('\n'));
            }
            if(deleteList.length != 0){
                ret.push('【削除したもの】\n' + deleteList.join('\n'));
            }
            if(invalidList.length != 0){
                ret.push('【処理できなかった命令】\n' + invalidList.join('\n'));
            }
            next(null, ret);
        };
    }
}

app.listen(app.get ('port'), function() {
    console.log('Node app is running');
});

// 署名検証タスク
function validateSignatureTask(request, secret) {
    return function(next) {
        if (!validateSignature(request, secret)) {
            next('ERROR: request header check NG');
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
            next('ERROR: request body check NG');
        } else {
            next();
        }
    }
}

// 返信メッセージを作成、送信するコールバック
function replyCallback(replyToken, accessToken) {
    return function(error, result) {
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
        client.replyMessage(replyToken, message)
            .then(() => {
                // console.log('DEBUG: reply success: ' + JSON.stringify(message));
            })
            .catch((err) => {
                console.log('ERROR: reply error: ' + err);
            });
    }
}
