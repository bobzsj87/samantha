var config = {};
var isRecording;
var recognized = null;
var recognition;
var messagesRef, presenceRef, statRef;
var isWindowActive = true;
var showAll = false;

function showMessage(type, msg, original, name, time){
  var rootApp = $('<div class="bs-callout"></div>');
  type=='response' && rootApp.addClass('bs-callout-right');
  var toApp = $('<div class="callout-inside"></div>');

  name && toApp.append('<span>'+name+'</span>');
  time && toApp.append('<span>, '+time+'</span>');

  var mainMessage = $('<div class="main-message">'+marked(msg)+'</div>');
  toApp.append(mainMessage);

  if (original){
    mainMessage.click(function(){
      $(this).siblings(".original").toggle();
    })
    var originalDom = $('<div class="original">'+original+'</div>');
    if (!showAll) originalDom.hide();

    originalDom.one('click', function(){
      translate(original, "en", function(t){
        originalDom.append(" ("+t+")");
      });
       
    })
    toApp.append(originalDom);        
  }

  $("#main-container").append(rootApp.append(toApp).append('<div class="clearfix"></div>'));

  scrollAnimate();

  // notigfication
  if (type == 'response'){
    notifyMe("From "+ name, msg);
  }
}

function samanthaSays(text){
  showMessage('response', text, null, 'Samantha');
}

function scrollAnimate(){
  $("html, body").animate({ scrollTop: $(document).height() }, 1000);
}

function startSession(){
  if (checkConfig()){
    //new callbacks
    var channelRef = new Firebase('https://samanthaexchange.firebaseio.com/channels/'+config.channel);
    messagesRef = channelRef.child("dialog");

    messagesRef.limitToLast(1).on('child_added', function (snapshot) {
      var data = snapshot.val();
      var name = data.name;
      var message;

      translate(data.text, config.lang, function(t){

        if (name == config.name){
          showMessage('message', t, data.text);
        }
        else{
          showMessage('response', t, data.text, name, moment(data.time).format("LT, ddd"));
          statRef.child("read/"+config.lang).transaction(function(current) {
            if (current == null) return 1;
            return current+1;
          })
        }
      });
    });

    // presence

    presenceRef = channelRef.child("presence");
    presenceRef.on('value', function(snapshot){
      config.nameList = snapshot.val();
    });

    var mePresenceRef = presenceRef.child(config.name);
    mePresenceRef.set(true);
    mePresenceRef.onDisconnect().remove();

    // statistics
    initStat();

    // other init
    isRecording = false;

    return true;
  }
  return false;
}

function initStat(){
  statRef = new Firebase('https://samanthaexchange.firebaseio.com/users/'+config.name+"/stat");
}

var Command = {
  run: function(text){
    var cmd = Command.evalCommand(text);
    if (!cmd) return false;
    if (Command[cmd.name]) Command[cmd.name].run(cmd);
    else samanthaSays("I don't understand your command. Try /help to see all available commands.");

    return true;
  },
  name: {
    run: function(cmd){
      var newName = typeof cmd == "string" ? cmd : cmd.args.join(" ");
      if (presenceRef){
        presenceRef.child(config.name).remove();
        presenceRef.child(newName).set(true);    
      }
      setConfigAndCookie('name', newName);
      samanthaSays("Welcome " + config.name);

      initStat();
    },
    help:"/name YourName: change name to YourName"
  },
  clear: {
    run: function(cmd){
      $("#main-container").html('');
    },
    help:"/clear: clear all conversation on your screen (but not others)"
  },
  channel: {
    run: function(cmd){
      if (cmd.args.length) location = "?channel="+encodeURIComponent(cmd.args.join(" "));
    },
    help:"/channel channelName: change to another channel"
  },
  who: {
    run: function(cmd){
      var who = "In channel "+config.channel+": ";

      for (var i in config.nameList){
        if (i == config.name) who += "(me) ";
        who += i + "<br/>";
      }
      samanthaSays(who);
    },
    help:"/who: print who is in this channel"
  },
  reset: {
    run: function(cmd){
      setCookie('name', '');
      setCookie('name', '');
      location.reload();
    },
    help:"/reset: clean your channel and name cookie and reload the page."
  },
  original: {
    run: function(cmd){
      if (cmd.args[0] == "on") {
        showAll = true;
        $(".original").show();
      }
      else if (cmd.args[0] == "off"){
        showAll = false;
        $(".original").hide();
      }
    },
    help:"/original on/off: if on, then always show original. If off, you can click to see the original message"
  },
  voice: {
    run: function(cmd){
      if (recognition){
        var lang = cmd.args[0];

        if (lang) {
          setConfigAndCookie('voicelang', lang);
          recognition.lang = lang;
          samanthaSays("Your voice recognition language is set to " + lang);
        }

      }
      else{
        samanthaSays("Please use Chrome to enable voice recognition");
      }
    },
    help:"/voice languageCode: set voice recognition language code, which can be en, fr, de, etc..."
  },
  // s: {
  //   run: function(cmd){
  //     var q = cmd.args.join(" ");
  //     translate(q, config.lang, function(t){
  //       // show my own word's translated message 
  //       showMessage('message', "Samantha, "+t, q);

  //       translate(q, "en", function(t){
  //         // show English to Samantha
  //         $.get('https://api.efjourney.com/?q='+encodeURIComponent(t)+"&sessionId=firebaseapp-"+encodeURIComponent(config.name)+"-"+encodeURIComponent(config.channel), function(feedback){
  //           // translate English from Samantha to my config.lang
  //           translate(feedback, config.lang, function(t){
  //             showMessage('response', t, feedback, "Samantha");
  //           })
  //         });
  //       })
  //     })
  //   },
  //   help:"/s any language: talk to Samantha. Like: /s how are you?"
  // },
  stat: {
    run: function(cmd){
      var toSee = config.name
      if (cmd.args.length){
        // see others
        toSee = cmd.args.join(" ");
      }
      var tmpRef = toSee == config.name ? statRef : statRef.parent().parent().child(toSee+"/stat");
      tmpRef.once('value', function(snapshot){
        var data = snapshot.val();
        samanthaSays(toSee +"'s statistics: "+JSON.stringify(data))
      });
    },
    help:"/stat [name]: show your or another name's language statistics. Another name is optional"
  },
  help:{
    run: function(cmd){
      samanthaSays(_.pull(_.map(Command, "help"), undefined).join("<br/>"));
    }
  },
  evalCommand: function (cmd){
    if (cmd.substring(0,1) == "/"){
      var args = cmd.substring(1).split(" ");
      return {
        name: args[0],
        args: args.slice(1)
      }
    }

    return false;
  },
  commands: function(){
    return _.pull(_.keys(Command), "run", "evalCommand", "commands");
  }
}

function submitInput(text){

  text = (text||$('#input').val()).trim();

  if (!text.length) return false;

  if (config.context){
    if (config.context == "initName") {
      Command.name.run(text);

      samanthaSays("Type /help to see more");
      if(startSession()){
        config.context = null;
      }
    }
  }
  else{
    if (!Command.run(text)){
      text = nonTranslate(text);
      messagesRef.push({name:config.name, text:text, time: Firebase.ServerValue.TIMESTAMP});

      detect(text, function(d){
        statRef.child("write/"+d).transaction(function(current) {
          if (current == null) return 1;
          return current+1;
        })
      });
      // add google analytics
      ga('send', 'event', 'dialog', 'submit', config.lang);      
    }
  }
  $('#input').val('');
  
  return true;
}

function toggleRecording(){
  if (isRecording) {
    recognition.stop();
    $("#button-recording").removeClass('active blink');
  }
  else {
    recognition.start();
    $("#button-recording").addClass('active blink');
  }

}

function notifyMe(title, body) {
  if (isWindowActive) return;
  if (Notification.permission !== "granted") Notification.requestPermission();
  else{
    var notification = new Notification(title, {
      icon: 'https://samanthaexchange.firebaseapp.com/logo.png',
      body: body,
    });   
  }

  // notification.onclick = function () {
  //   window.open("http://stackoverflow.com/a/13328397/1269037");      
  // };
}


function initConfig(){
  config.lang = getCookie('lang') || 'en';
  config.voicelang = getCookie('voicelang') || 'en';
  $('#lang').val(config.lang);

  config.channel = getQueryParam("channel"); 
  config.name = getCookie('name');
  config.engine = getQueryParam("engine") || "google";

    // check notification permission
  try{
    if (Notification.permission !== "granted") Notification.requestPermission();
  }
  catch (e){
    // do nothing here
  }

   // speech
  try{
    recognition = new webkitSpeechRecognition();
    recognition.lang = config.voicelang;

    recognition.onerror = function(event) {
      console.error(event.error);
    };

    recognition.onstart = function(event){
      isRecording = true;
      recognized = null;
      $(".recording-alert").fadeIn();

      // GA
      ga('send', 'event', 'dialog', 'voice', config.voicelang);
    }

    recognition.onend = function(event) {
      if (recognized){
        var original = $('#input').val();
        $('#input').val(original + ' ' + recognized).focus();
      }
      isRecording = false;
      $(".recording-alert").fadeOut();
    };

    recognition.onresult = function(event) {
      recognized = event.results[event.results.length-1][0].transcript;
    };   
    console.log("app initiated");
  }
  catch(e){
  }

}

$(document).ready(function(){

  initConfig();

  if (!startSession()){
    if (!config.name){
      samanthaSays("What's your name?");
      config.context = "initName";
    }
  } 

  // bindings
  // start recording
  $(this).keypress(function(event){
    if (event.which == 13 && event.ctrlKey){
      toggleRecording();
      return false;
    }
  });

  // submit text input
  $("#input-form").submit(function(event){
    if (isRecording) return false;

    try{
      // just for debug
      submitInput();
    }
    catch (e){
      console.log(e)
    }
    // if (!isRecording){
    //   submitInput(); 
    // }
    event.preventDefault();
    return false;
  });
  
  $('.lang-setting').change(function(){
    var t = $(this);
    setConfigAndCookie(t.attr('id'), t.val());
  });



  $(window).resize(function(){
    $('body').css('padding-bottom', $(".navbar-fixed-bottom").height()+10+"px");
  })

  // easy to input
  $('#input').focus();

});


window.onfocus = function () { 
  isWindowActive = true; 
}; 

window.onblur = function () { 
  isWindowActive = false; 
}; 

// helpers
///
///

function translate(text, lang, cb){

  $.get('https://api.efjourney.com/translate?q='+encodeURIComponent(text)+"&lang="+lang+"&engine="+config.engine, function(translated){
    cb(translated);
  });
}

function detect(text, cb){

  $.get('https://api.efjourney.com/translate?action=detect&q='+encodeURIComponent(text)+"&engine="+config.engine, function(detected){
    cb(detected);
  });
}


function nonTranslate(text){
  if (config.engine == "yandex") return text;
  return text.replace(/\[\[/g, '<span class="notranslate">').replace(/\]\]/g, "</span>");
}

function checkConfig(){
  return config.name && config.channel && config.name.length>0 && config.channel.length>0;
}

function setConfigAndCookie(name, value){
  config[name] = value;
  setCookie(name, value, 7);
}

function setCookie(cname, cvalue, exdays) {
    var d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    var expires = "expires="+d.toUTCString();
    document.cookie = cname + "=" + cvalue + "; " + expires;
}

function getCookie(cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for(var i=0; i<ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1);
        if (c.indexOf(name) == 0) return c.substring(name.length, c.length);
    }
    return "";
}

function getQueryParam(name, url) {
  if (!url) url = location.href;
  name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
  var regexS = "[\\?&]"+name+"=([^&#]*)";
  var regex = new RegExp( regexS );
  var results = regex.exec( url );
  return results == null ? null : decodeURIComponent(results[1]);
}
