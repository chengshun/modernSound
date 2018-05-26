//根据设备samplerate创建context
function createAudioContext(desiredSampleRate){
	const audioContext =  window.AudioContext || window.webkitAudioContext;
	const sampleRate = typeof desiredSampleRate === 'number' ? desiredSampleRate : 44100; 
	let context = new audioContext();

	if (/(iPhone|iPad)/i.test(navigator.userAgent) && context.sampleRate !== sampleRate) {
		const buffer = context.createBuffer(1, 1, sampleRate);
		const dummy = context.createBufferSource();
		dummy.buffer = buffer;
		dummy.connect(context.destination);
		dummy.start(0);
		dummy.disconnect(); 
		context.close();
		context = new audioContext();
	}
	return context;	
}

//检查格式是否播放
function getCanPlayType(){
  let audioTest = null;

  // Must wrap in a try/catch because IE11 in server mode throws an error.
  try {
    audioTest = (typeof Audio !== 'undefined') ? new Audio() : null;
  } catch (err) {
    return null;
  }

  if (!audioTest || typeof audioTest.canPlayType !== 'function') {
    return null;
  }

  var mpegTest = audioTest.canPlayType('audio/mpeg;').replace(/^no$/, '');

  // Opera version <33 has mixed MP3 support, so we need to check for and block it.
  var checkOpera = self._navigator && self._navigator.userAgent.match(/OPR\/([0-6].)/g);
  var isOldOpera = (checkOpera && parseInt(checkOpera[0].split('/')[1], 10) < 33);

  return {
  	mp3: !!(!isOldOpera && (mpegTest || audioTest.canPlayType('audio/mp3;').replace(/^no$/, ''))),
  	mpeg: !!mpegTest,
  	ogg: !!audioTest.canPlayType('audio/ogg; codecs="vorbis"').replace(/^no$/, ''),
	oga: !!audioTest.canPlayType('audio/ogg; codecs="vorbis"').replace(/^no$/, ''),
	wav: !!audioTest.canPlayType('audio/wav; codecs="1"').replace(/^no$/, ''),
    mp4: !!(audioTest.canPlayType('audio/x-mp4;') || audioTest.canPlayType('audio/mp4;') || audioTest.canPlayType('audio/aac;')).replace(/^no$/, ''),
    weba: !!audioTest.canPlayType('audio/webm; codecs="vorbis"').replace(/^no$/, ''),
    webm: !!audioTest.canPlayType('audio/webm; codecs="vorbis"').replace(/^no$/, '')       	
  }	
}

function sourcePlay(source){
    if (typeof source.start === 'undefined') {
      source.noteOn(0);
    } else {
      source.start(0);
    }	
} 

function getAvailableSrc(resources) { //获取可以播放的资源
	return resources.filter((res) => {
		const type = res.indexOf('.') > -1 ? res.split('.')[1] : '';
		return getCanPlayType(type);
	});	
}

function Sound(){
	this.volume = 1;
	this.source = null;
}

Sound.prototype = {

	init: function (buffer, ctx) {
		const source = ctx.createBufferSource();
		const gainNode = ctx.createGain();
		gainNode.gain.value = this.volume;
		source.buffer = buffer;
		source.connect(gainNode);
		gainNode.connect(ctx.destination);

		this.source = source;
	},

	play: function(name, sprite) {
		this.source.start = this.source.start || this.source.noteOn;
		if (name === 'default') {
			this.source.start(0);
		} else if (sprite && sprite.hasOwnProperty(name)) {
			const [offset, duration, loop] = sprite[name];
			const offsetMils = offset / 1000;
			const durationMils = duration / 1000;

			if (loop) {
				this.source.loopStart = offsetMils;
				this.source.loopEnd = offsetMils + durationMils;
				this.source.loop = true;	
				this.source.start(0, offsetMils, 86400); 
			} else {
				this.source.start(0, offsetMils, durationMils);
			}
		}	
	},

	stop: function () {
		this.source.stop();
	},

	resume: function () {
		this.source.resume();
	},

	pause: function () {
		this.source.suspend();
	},

	destory: function () {
		this.source.disconnect(0);
	},

	setVolumne: function (volume, inverse) {
		this.volume = inverse ? volume * 100 : volume /100;
	}
};

function modernSound(options) {
	this._navigator = (typeof window !== 'undefined' && window.navigator) ? window.navigator : null;
	this.options = options;
	this.volume = options.volume || 1; 
	this.queue = []; //资源未加载完成前调用事件的队列
	this.mute = false; //是否静音
	this.state = 'unload';
	this.unlock = false;
	this.bufferList = {}; //已加载的buffers
	this.playingSounds = {}; //当前播放中的souds
	this.state = 'unload';
	this.url = null; //当前播放的音频url
	this._mobileEnabled = false;
	this.sourcePool = {};

	try {
		this.ctx = createAudioContext(); //根据不同sampleRate生成Audio 实例
	} catch (e) {
		console.log("No Web Audio API support");
	}

	if (!this.ctx) return;
	this.init();
}

modernSound.prototype = {

	init: function () {
		const self = this;
		const { src, autoplay } = this.options;

		this._enableMobileAudio();

		if (autoplay) {
			this.queue.push({
				event: 'play',
				action: function(){
					self.play();
				}
			});
		}	

		this.url = this.checkSrc(src);
		this.addSound(this.url);
	},

	checkSrc: function(src) {
		const resources = Array.isArray(src) ? src : [src];
		const availableSrc = getAvailableSrc(resources);

		return availableSrc.length ? availableSrc[0] : null;
	},	

	loadQueue: function(){
		if (this.queue.length > 0) {
			const task = this.queue[0];
			task.action();
			this.queue.shift();
			this.loadQueue();
		}
	},	

	_enableMobileAudio: function () { //通过播放空得音频，解决ios下不能自动播放的问题
      	const self = this; 
      	const isMobile = /iPhone|iPad|iPod|Android|BlackBerry|BB10|Silk|Mobi/i.test(self._navigator && self._navigator.userAgent);
      	const isTouch = !!(('ontouchend' in window) || (self._navigator && self._navigator.maxTouchPoints > 0) || (self._navigator && self._navigator.msMaxTouchPoints > 0));
      	//if (!isMobile && !isTouch) return;

      	const unlock = function () {
      		if (self._mobileEnabled) return;
      		const buffer = self.ctx.createBuffer(1, 1, 22050);
      		const source = self.ctx.createBufferSource();
      		source.connect(self.ctx.destination);

      		//播放空音频
      		sourcePlay(source);

	        // Calling resume() on a stack initiated by user gesture is what actually unlocks the audio on Android Chrome >= 55.
	        if (typeof self.ctx.resume === 'function') { 
	          self.ctx.resume();
	        }
	        //self.addSound(self.url);
	        source.onended = function () {
	        	source.disconnect(0);
	        	self._mobileEnabled = true;
		        // Remove the touch start listener.
		        document.removeEventListener('touchstart', TapEvent, true);
		        document.removeEventListener('touchend', TapEvent, true);	        	
	        } 
      	}
      	const TapEvent = Tap(unlock);
        document.addEventListener('touchstart', TapEvent, true);
        document.addEventListener('touchend', TapEvent, true);	      	
	},

	loadAudioResource: function(url){
		const self = this;		
		const request = new XMLHttpRequest();

		return new Promise((resolve, reject) => {
			request.open('GET', url, true);
			request.responseType = 'arraybuffer';	
			request.onload = () => {
				self.state = 'loaded';
				self.ctx.decodeAudioData(request.response, (buffer) => {
					if (buffer) {
						resolve(buffer);
					} else {
						reject('decoding error');
					}
				}, (err) => {
					if (err) {
						reject(error);
					}
				})
			};
			request.send();	
		});
	}, 

	addSound: function (url) {
		if (!url) return;
		const { loaded } = this.options;
		this.loadAudioResource(url)
			.then((buffer) => {
				this.bufferList[url] = buffer;
				loaded && loaded();
				this.loadQueue();
			});

	},

	makeSource: function (buffer) {
		const source = this.ctx.createBufferSource();
		const gainNode = this.ctx.createGain();
		gainNode.gain.value = this.volume;
		source.buffer = buffer;
		source.connect(gainNode);
		gainNode.connect(this.ctx.destination);

		return { source, gainNode };
	},	

	// play: function (name='default', url) {
	// 	if (this.state !== 'loaded') {
	// 		this.queue.push({
	// 			event: 'play',
	// 			action: function(){
	// 				currentInstance.play(name, sprite);
	// 				this.playOnLoaded(name, url);
	// 			}
	// 		})			
	// 	} else {
	// 		this.playOnLoaded(name, url);
	// 	}

	// 	return currentInstance;	
	// },

	play: function (name='default', url, onended) {
		const self = this;
		if (this.state !== 'loaded') { //资源未加载完成
			this.queue.push({
				event: 'play',
				action: function(){
					//self.play(name, url);
					self.playOnLoaded(name, url, onended);
				}
			})
		} else {
			this.playOnLoaded(name, url, onended);
		}
	},

	// playOnLoaded: function(name, url) {
	// 	const { sprite } = this.options;
	// 	const targetUrl = url || this.url;
	// 	const buffer = this.bufferList[targetUrl];
	// 	const sourceKey = `${targetUrl}_${name}`;
	// 	let currentInstance = null;

	// 	if (!this.sourcePool[sourceKey]){
	// 		currentInstance = new Sound();	
	// 		currentInstance.init(buffer, this.ctx);
	// 		this.sourcePool[sourceKey] = currentInstance;
	// 	} else {
	// 		currentInstance = this.sourcePool[sourceKey];
	// 	}

	// 	currentInstance.play(name, sprite);

	// 	return currentInstance;
	// },
	getSource: function (name, url) {
		const targetUrl = url || this.url;
		const sourceKey = `${targetUrl}_${name}`;
		const sourceInstance = this.sourcePool[sourceKey];
		return { sourceInstance, sourceKey };		
	},

	playStop: function(name, url){
		const { sourceInstance, sourceKey } = this.getSource(name, url);
		if (!sourceInstance) return;
		sourceInstance.source.stop();	
		this.playingSounds[sourceKey] = null;
	},

	stop: function (name='default', url) {
		const self = this;
		if (this.state !== 'loaded') {
			this.queue.push({
				event: 'stop',
				action: function(){
					self.playStop(name, url);
				}
			})
		} else {
			this.playStop(name, url);
		}
	},
	
	setVolume: function(volume, inverse, name='default', url){
		const { sourceInstance, sourceKey } = this.getSource(name, url);
		if (!sourceInstance) return;
		let currentVolume = inverse ? volume * 100 : volume /100;
		sourceInstance.gainNode.gain.value = currentVolume;
	},

	resume: function(name) {
		if (this.state !== 'loaded') {
			this.queue.push({
				event: 'resume',
				action: function(){
					self.ctx.resume();
				}
			})
		} else {
			this.ctx.resume();
		}
	},

	pause: function(){
		if (this.state !== 'loaded') {
			this.queue.push({
				event: 'pause',
				action: function(){
					self.ctx.suspend();
				}
			})
		} else {
			this.ctx.suspend();
		}
	},	

	stopAll: function () {
		for (let source in this.sourcePool) {
			source && source.stop();
		}
	},

	playOnLoaded: function (name, url, onended) {
		const self = this;
		const targetUrl = url || this.url;
		const buffer = this.bufferList[targetUrl];
		const sourceKey = `${targetUrl}_${name}`;

		let currentSource = this.sourcePool[sourceKey] ? this.sourcePool[sourceKey].source || null : null;
		if (currentSource) {
			currentSource.disconnect();
			this.sourcePool[sourceKey] = null;
		}

		const source = this.makeSource(buffer);
		currentSource = source.source;
		//add source to sourcePool
		this.sourcePool[sourceKey] = source;	

		this.playingSounds[sourceKey] = currentSource;
		
		currentSource.onended = function(){
			console.log('end');
			onended && onended();
			self.playingSounds[sourceKey] = null;
		};

		if (name === 'default') {
			sourcePlay(currentSource);
		} else {
			this.playByName(name, currentSource);
		}
	},

	playByName: function (name, source) {
		const { sprite } = this.options;
		if (!source) return;
		source.start = source.start || source.noteOn;	
		if (sprite && sprite.hasOwnProperty(name)) {
			const [offset, duration, loop] = sprite[name];
			const offsetMils = offset / 1000;
			const durationMils = duration / 1000;

			if (loop) {
				source.loopStart = offsetMils;
				source.loopEnd = offsetMils + durationMils;
				source.loop = true;	
				source.start(0, offsetMils, 86400); 
			} else {
				source.start(0, offsetMils, durationMils);
			}
		}			
	}
}