var _             = require('lodash');
var Client        = require('node-rest-client').Client;
var Twit          = require('twit');
var async         = require('async');
var wordFilter    = require('wordfilter');
var app           = require('express').createServer();

var t = new Twit({
  consumer_key:         process.env.PICKTWOBOT_TWIT_CONSUMER_KEY,
  consumer_secret:      process.env.PICKTWOBOT_TWIT_CONSUMER_SECRET,
  access_token:         process.env.PICKTWOBOT_TWIT_ACCESS_TOKEN,
  access_token_secret:  process.env.PICKTWOBOT_TWIT_ACCESS_TOKEN_SECRET
});

var wordnikKey =        process.env.WORDNIK_API_KEY;

app.get('/', function(req, res) {
  res.send('Hello world');
});
app.listen(3000);

getDummyTweet = function(cb) {
  var botData = {
    tweet         : "You should probably keep an eye on that http://t.co/nbg6jDGUmN in the next hour...just saying...",
    tweetID       : '142423423',
    tweetUsername : 'testusername'
  };
  cb(null, botData);
}

getPublicTweet = function(cb) {
  t.get('search/tweets', {q: 'the', count: 1, result_type: 'mixed'}, function(err, data, response) {
    if (!err) {
      var botData = {
        tweet           : data.statuses[0].text.toLowerCase(),
        tweetID         : data.statuses[0].id_str,
        tweetUsername   : data.statuses[0].user.screen_name
      };
      cb(null, botData);
    } else {
      console.log("There was an error getting a public Tweet. Abandoning EVERYTHING :(");
      cb(err, botData);
    }
  });
};

extractWordsFromTweet = function(botData, cb) {
  var excludeNonAlpha       = /[^a-zA-Z]+/;
  var tweet                 = botData.tweet;
  botData.tweetWordList     = tweet.split(excludeNonAlpha);
  var excludedElements = [
    'RT','MT','co','com','http','a','and','the','pick',
    's','t','m','re','i','u','select','picking'
  ];
  botData.tweetWordList = _.reject(botData.tweetWordList, function(w) {
    return _.contains(excludedElements, w);
  });

  cb(null, botData);
};

getAllWordData = function(botData, cb) {
  async.map(botData.tweetWordList, getWordData, function(err, results){
    botData.wordList = results;
    cb(err, botData);
  }); 
}

getWordData = function(word, cb) {
  var client = new Client();

  var wordnikWordURLPart1   = 'http://api.wordnik.com:80/v4/word.json/';
  var wordnikWordURLPart2   = '/definitions?limit=1&includeRelated=false&useCanonical=true&includeTags=false&api_key=';

  var args = {
    headers: {'Accept':'application/json'}
  };

  var wordnikURL = wordnikWordURLPart1 + word.toLowerCase() + wordnikWordURLPart2 + wordnikKey;

  client.get(wordnikURL, args, function (data, response) {
    if (response.statusCode === 200) {
      var result = JSON.parse(data);
      if (result.length) {
        cb(null, result);
      } else {
        cb(null, null);
      }
    } else {
      cb(null, null);
    }
  });
};

findNouns = function(botData, cb) {
  botData.nounList = [];
  botData.wordList = _.compact(botData.wordList);
  
  _.each(botData.wordList, function(wordInfo) {
    var word            = wordInfo[0].word;
    var partOfSpeech    = wordInfo[0].partOfSpeech;

    if (partOfSpeech == 'noun' || partOfSpeech == 'proper-noun') {
      botData.nounList.push(word);
    }
  });

  if (botData.nounList.length >= 3) {
    cb(null, botData);
  } else {
    cb('There are fewer than 3 nouns.', botData);
  }
}

formatTweet = function(botData, cb) {
  botData.pickTwoWordList = [];
  _.each(botData.nounList.slice(0,3), function(word) {
    word = word.charAt(0).toUpperCase() + word.slice(1) + ".";
    botData.pickTwoWordList.push(word);
  });

  var tweetLine1    = botData.pickTwoWordList.join(' ');
  var tweetLine2    = 'Pick Two.';
  var tweetLine3    = 'http://twitter.com/' + botData.tweetUsername + '/status/' + botData.tweetID;
  botData.tweetBlock = tweetLine1 + '\n' + tweetLine2 + '\n' + tweetLine3;
  cb(null, botData);
}

dummyPost = function(botData, cb) {
  console.log("Tweet: ", botData);
}

postTweet = function(botData, cb) {
  if (!wordFilter.blacklisted(botData.tweetBlock)) {
    t.post('statuses/update', {status: botData.tweetBlock}, function(err, data, response) {
      cb(err, response);
    });
  }
}

run = function() {
  async.waterfall([
    getPublicTweet, 
    extractWordsFromTweet, 
    getAllWordData, 
    findNouns,
    formatTweet,
    postTweet
  ],
  function(err, response) {
    if (err) {
      console.log('There was an error posting to Twitter: ', err);
      console.log('Response: ', response);
    } else {
      console.log('Tweet successful!');  
    }
  });
}

setInterval(function() {
  try {
    run();
  }
  catch (e) {
    console.log(e);
  }
}, 60000*60);
