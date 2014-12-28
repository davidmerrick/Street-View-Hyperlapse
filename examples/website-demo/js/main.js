$(function($) {

	var attribution;

	var tips_array = [
		'Tip: Try a shorter route to get a smoother hyperlapse.',
		'Tip: Long straight and flat roads work best. Bridges, tunnels and highways especially.',
		'Tip: Try moving the crosshairs around while the animation is running.'
	];

	var resizer = function() {
		gallerySizer = $('.generate-wrapper ul').width() - $('.generate-wrapper ul li.featured').width() - $('.generate-wrapper ul li.generate').width() - (15 * 6);
		inputSizer = gallerySizer - 150;

		$('.search').css('width', gallerySizer);
		$('.search input').css('width', inputSizer);
	};

	var playlistResizer = function() {
		if ( $('.overlay').width() < 801 ) {
			$('.playlist').css('width', '325px');
		}
		if ($('.overlay').width() > 800) {
			$('.playlist').css('width', '678px');
		}
		resizer();
	};

	var tips = function() {
		$('.tips').html(tips_array[Math.floor( Math.random()*tips_array.length )] || tips_array[0] );
	};

	$('.fancybox-media').fancybox({
		width: 960,
		height: 540,
		openEffect  : 'none',
		closeEffect : 'none',
		padding : 0,
		helpers : {
			media : {}
		}
	});

	resizer();
	playlistResizer();

	// http://www.browserleaks.com/webgl#howto-detect-webgl
	// Detect WebGL avaiable and turned on
	function webgl_detect(return_context) {
		if (!!window.WebGLRenderingContext) {
			var canvas = document.createElement("canvas"),
				names = ["webgl", "experimental-webgl", "moz-webgl", "webkit-3d"],
				context = false;

				for(var i=0;i<4;i++) {
				try {
					context = canvas.getContext(names[i]);
					if (context && typeof context.getParameter == "function") {
						// WebGL is enabled
						if (return_context) {
							// return WebGL object if the function's argument is present
							return {name:names[i], gl:context};
						}
						// else, return just true
						return true;
					}
				} catch(e) {
					// catch issues and return false
					console.log(e);
					return false;
				}
			}
			// WebGL is supported, but disabled
			return false;
		}
		// WebGL not supported
		return false;
	}

	if(webgl_detect(1)){
		console.log('WebGL good to go');
	}else{
		alert('This experiment requires WebGL. Your best bet is Google Chrome.');
		return false;
	}

	var hyperlapse, map, directions_renderer, directions_service, streetview_service, geocoder, street_overlay;

	var ui = {
		'controls': {
			'height'    :  85,
			'hidden'    : -85,
			'controller': {
				'state': false
			}
		},
		'player' : {
			'state' : false
		}
	};

	var hyper = {
		'ready' : false,
		'start' : null,
		'end'   : null,
		'look'  : null,
		'elevation': 0,
		'fov': 80,
		'slider_p': 0,
		'route'    : null,
		'map'   : {
			'el'      : document.getElementById("map"),
			'options' : {
				'mapTypeId'         : google.maps.MapTypeId.ROADMAP,
				'streetViewControl' : false,
				'scrollwheel'       : true,
				'panControl'        : false,
				'zoomControlOptions': {
					'style'    : google.maps.ZoomControlStyle.SMALL,
					'position' : google.maps.ControlPosition.LEFT_TOP
				},
				'mapTypeControlOptions': {
					'position' : google.maps.ControlPosition.TOP_RIGHT
				},
				'zoom'              : 10,
				'maxZoom'           : 18,
				'minZoom'           : 5
			},
			'pins'    : {
				'start'  : {
					'icon'   : 'img/pin-a.png',
					'alt'    : 'img/dot-a.png',
					'shadow' : 'img/pin-shadow.png'
				},
				'end'    : {
					'icon'   : 'img/pin-b.png',
					'alt'    : 'img/dot-b.png',
					'shadow' : 'img/pin-shadow.png'
				},
				'camera' : {
					'icon'   : new google.maps.MarkerImage('img/cross.png', null, null, new google.maps.Point(20, 20)),
					'shadow' : 'img/cross-shadow.png'
				},
				'pivot'  : {
					'icon'   : 'img/heading.png'
				}
			},
			'drag'    : true
		},
		'pano'  : {
			'el'      : document.getElementById("pano"),
			'x'       : 0,
			'y'       : 0,
			'moving'  : false,
			'pointer' : {
				'x' : 0,
				'y' : 0
			}
		}
	};

	var getRandomInt = function (min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	};

	var getDirections = function(autoload){

		directions_renderer.setMap(null);
		directions_renderer.setMap(map);

		var request = {
			origin: hyper.start,
			destination: hyper.end,
			travelMode: google.maps.TravelMode.DRIVING,
			region: 'en'
		};

		// replaces straight call to DirectionsService with DynamoDB caching solution

		getRoute(directions_service, request, function(result, status) {
			if (status == google.maps.DirectionsStatus.OK) {
				hyper.route = result;
				directions_renderer.setDirections(result);
				if(autoload) $('#generate').trigger('click');
			} else if(status == google.maps.DirectionsStatus.OVER_QUERY_LIMIT) {
				alert("Opps. We hit our daily rate limit for Google Maps. Please try again tomorrow, or check out the Featured routes.");
			} else {
				console.log("We hit a snag with Google Maps.");
			}
		});

		// Clean DirectionsService call
		/*
		directions_service.route(request, function(result, status) {
			if (status == google.maps.DirectionsStatus.OK) {
				hyper.route = result;
				directions_renderer.setDirections(result);

				if(autoload) $('#generate').trigger('click');
			}
		});
		*/
	};

	// MAP functions

	var mapCenterPoints = function(from_cancel){
		var markerBounds = new google.maps.LatLngBounds();
		markerBounds.extend(hyper.start);
		markerBounds.extend(hyper.end);
		markerBounds.extend(hyper.look);

		if(from_cancel) map.panToBounds(markerBounds);
		else map.fitBounds(markerBounds);
	};

	var searchMap = function(){
		var q = $('#address').val();

		geocoder.geocode( { 'address': q}, function(results, status) {
			if (status == google.maps.GeocoderStatus.OK) {

				map.setCenter(results[0].geometry.location);

				var bounds = map.getBounds();
				var top_left = bounds.getNorthEast();
				var bot_right = bounds.getSouthWest();
				var hdif = Math.abs(top_left.lng() - bot_right.lng());
				var spacing = hdif/4;

				var center = map.getCenter();
				var c1 = new google.maps.LatLng(center.lat(), center.lng()-spacing);
				var c2 = new google.maps.LatLng(center.lat(), center.lng());
				var c3 = new google.maps.LatLng(center.lat(), center.lng()+spacing);

				hyper.start = c1;
				hyper.look = c2;
				hyper.end = c3;

				// clear old map route

				directions_renderer.setMap(null);

				// redrop pins

				start_pin.setPosition(c1);
				camera_pin.setPosition(c2);
				end_pin.setPosition(c3);

				start_pin.setIcon(hyper.map.pins.start.alt);
				start_pin.setShadow(hyper.map.pins.camera.shadow);

				end_pin.setIcon(hyper.map.pins.end.alt);
				end_pin.setShadow(hyper.map.pins.camera.shadow);

				//mapCenterPoints();

			} else if(status == google.maps.GeocoderStatus.OVER_QUERY_LIMIT) {
				alert("Oops. We hit our daily rate limit for Google Maps. Please try again tomorrow, or check out the Featured routes.");
			} else {
				console.log("We hit a snag with Google Maps.");
			}


		});
	};

	// UX functions

	var toggleOverlay = function(from_cancel) {
		var overlay = $('.overlay');
		var state = (overlay.attr('data-state') === 'true') ? false : true;
		var viewportWidth  = $(window).width()  - 72 - $('#credits').outerWidth();
		var viewportHeight = $(window).height() - 50;
		var expanded = (viewportWidth < viewportHeight) ? viewportWidth : viewportHeight;
		var closed = '300px';

		if(state){
			hyper.ready = true;
			setTimeout(function() {
				$('.expand').show();
				$('.overlay').css('padding-bottom', '42px');
				$('#pano').addClass('active');
				play(true);
			}, 500);

			// $('#pano').addClass('active');
			$('.expand').css('width', '100%');
			$('.expand p').show();
			$('.expand > div').removeClass('open').addClass('closed');
			overlay.css({
				'width':  closed,
				'height': closed,
				'padding-bottom': '42px'
			});
			$('#map, .map-cover').css({
				'width':  closed,
				'height': closed
			});

			toggleGallery(false);

			$('#credits').css('opacity', 0);
			$('#logos').css('opacity', 1);
			$('.generate-wrapper').hide();
			togglePinDrag(false);

		}else{
			play(false);
			hyper.ready = false;

			// $('#pano').removeClass('active');
			$('.expand').css('width', '38px');
			$('.expand p').hide();
			$('.expand > div').removeClass('closed').addClass('open');
			overlay.css({
				'width':  expanded,
				'height': expanded,
				'padding-bottom': '0'
			});
			$('#map, .map-cover').css({
				'width':  expanded,
				'height': (expanded-100)
			});
			$('#controls').css('bottom',ui.controls.hidden);
			ui.controls.controller.state = false;
			togglePinDrag(true);
			$('.generate-wrapper').delay(1000).fadeIn();
			$('#logos').css('opacity', 0);
		}

		overlay.attr('data-state', state);

		setTimeout(function() {
			google.maps.event.trigger(map, "resize");
			mapCenterPoints(from_cancel);
			handlePinLocations();
		}, 401);

		// resizer();
	};

	var toggleGallery = function(state) {
		var newstate = (state) ? false : true;
		ui.controls.controller.state = newstate;
		if(state) {
			setPlaylistHeight();
			$('.playlist').fadeIn('slow');
			// resizer();
		}else{
			$('.playlist').hide();
		}
	};

	var togglePinDrag = function(state) {
		//map.setOptions({draggable:state});
		start_pin.setDraggable(state);
		end_pin.setDraggable(state);

		start_pin.setVisible(state);
		end_pin.setVisible(state);

		state = (state) ? false : true;
		hyper.map.drag = state;
	};

	var setSliderWidth = function(){
		var w = $(window).width() - ($('#play').width()+$('#playlist').width()) -260;
		$('#slider').width(w);
	};

	var setPlaylistHeight = function(){
		$('.playlist ul').height($('#map').height()-50 );
	};

	var dragPin = function(){
		street_overlay.setMap(map);
	};

	var snapToRoad = function (point, callback) {
		var request = {
			origin: point,
			destination: point,
			travelMode: google.maps.TravelMode["DRIVING"]
		};

		directions_service.route(request, function(response, status) {
			if(status=="OK"){
				var point = response.routes[0].overview_path[0];

				streetview_service.getPanoramaByLocation(point, 50, function (streetViewPanoramaData, status) {
					if (status === google.maps.StreetViewStatus.OK) callback(point);
					else callback(null);
				});
			}else if(status == google.maps.DirectionsStatus.OVER_QUERY_LIMIT) {
				alert("Opps. We hit our daily rate limit for Google Maps. Please try again tomorrow, or check out the Featured routes.");
				callback(null);
			} else {
				console.log("We hit a snag with Google Maps.");
				callback(null);
			}
		});
	};

	var checkPinPos = function(pos, marker) {
		var zoomLevel = map.getZoom();

		var bnd = map.getBounds();
		var ne = bnd.getNorthEast();
		var sw = bnd.getSouthWest();

		var bufferTop = Math.abs( ne.lat() - sw.lat() )*0.1;
		var bufferBot = Math.abs( ne.lat() - sw.lat() )*0.04;
		var bufferSide = Math.abs( ne.lng() - sw.lng() )*0.04;
		var posLat = pos.lat();
		var posLng = pos.lng();

		if (posLat >= (sw.lat()+bufferBot) && posLat <= (ne.lat()-bufferTop) &&
			posLng >= (sw.lng()+bufferSide) && posLng <= (ne.lng()-bufferSide) ) {
			// reset marker to point
			marker.setPosition(pos);
			return true;
		}else{
			var lat = posLat;
			var lng = posLng;

			if ( lat >= (ne.lat()-bufferTop) ){
				lat = ne.lat()-bufferTop;
			}else if( lat <= (sw.lat()+bufferBot) ){
				lat = sw.lat()+bufferBot;
			}

			if ( lng >= (ne.lng()-bufferSide) ){
				lng = ne.lng()-bufferSide;
			}else if( lng <= (sw.lng()+bufferSide) ){
				lng = sw.lng()+bufferSide;
			}

			var mPos =  new google.maps.LatLng(lat, lng);
			marker.setPosition(mPos);
			return false;
		}
	};

	var getPointFromLatLng = function(ll) {
		var factor = Math.pow(2, map.getZoom());
		var p = map.getProjection().fromLatLngToPoint(ll);
		p.x *= factor;
		p.y *= factor;

		return p;
	};

	const CORNER_NONE = 0;
	const CORNER_TOP_LEFT = 1;
	const CORNER_TOP_RIGHT = 2;
	const CORNER_BOT_LEFT = 3;
	const CORNER_BOT_RIGHT = 4;

	var findCorner = function(pin, buffer) {
		buffer = buffer || 100;
		var factor = Math.pow(2, map.getZoom());

		var bounds = map.getBounds();
		var top_right = getPointFromLatLng( bounds.getNorthEast() );
		var bot_left = getPointFromLatLng( bounds.getSouthWest() );

		var pin_point = getPointFromLatLng( pin.getPosition() );

		var d_tr_x = Math.abs(top_right.x - pin_point.x);
		var d_tr_y = Math.abs(top_right.y - pin_point.y);
		var d_bl_x = Math.abs(bot_left.x - pin_point.x);
		var d_bl_y = Math.abs(bot_left.y - pin_point.y);

		if(d_bl_x < buffer) {

			if(d_tr_y < buffer) {
				return CORNER_TOP_LEFT;
			} else if(d_bl_y < buffer) {
				return CORNER_BOT_LEFT;
			}

		} else if(d_tr_x < buffer) {

			if(d_tr_y < buffer) {
				return CORNER_TOP_RIGHT;
			} else if(d_bl_y < buffer) {
				return CORNER_BOT_RIGHT;
			}

		}

		return CORNER_NONE;
	};


	const SIDE_NONE = 0;
	const SIDE_TOP = 1;
	const SIDE_BOTTOM = 2;
	const SIDE_LEFT = 3;
	const SIDE_RIGHT = 4;

	var findSide = function(pin, buffer) {
		buffer = buffer || 100;
		var factor = Math.pow(2, map.getZoom());

		var bounds = map.getBounds();
		var top_right = getPointFromLatLng( bounds.getNorthEast() );
		var bot_left = getPointFromLatLng( bounds.getSouthWest() );

		var pin_point = getPointFromLatLng( pin.getPosition() );

		var d_tr_x = Math.abs(top_right.x - pin_point.x);
		var d_tr_y = Math.abs(top_right.y - pin_point.y);
		var d_bl_x = Math.abs(bot_left.x - pin_point.x);
		var d_bl_y = Math.abs(bot_left.y - pin_point.y);

		if(d_tr_x < buffer) {
			return SIDE_RIGHT;
		} else if(d_bl_x < buffer) {
			return SIDE_LEFT;
		} else if(d_tr_y < buffer) {
			return SIDE_TOP;
		} else if(d_bl_y < buffer) {
			return SIDE_BOTTOM;
		}

		return SIDE_NONE;
	};

	var setHeadingImage	= function(pin, position, prefix) {
		var heading = google.maps.geometry.spherical.computeHeading(pin.getPosition(), position) + 180;
		var img_index = Math.floor( Math.round(heading/45) );
		if(img_index==8) img_index=0;
		pin.setIcon('img/pins/pin_'+prefix+''+img_index+'.png');
		//pin.setShadow(hyper.map.pins.camera.shadow);
		pin.setShadow(null);
	};

	var handlePinLocations = function(){

		var start_offscreen = false;
		var look_offscreen = false;
		var end_offscreen = false;

		var heading, img_index;

		if( checkPinPos(hyper.look, camera_pin) ) {
			camera_pin.setIcon(hyper.map.pins.camera.icon);
		} else {
			if(!is_pin_dragging) setHeadingImage(camera_pin, hyper.look, 't');
			look_offscreen = true;
		}

		if( checkPinPos(hyper.start, start_pin) ){
			start_pin.setIcon(hyper.map.pins.start.icon);
			start_pin.setShadow(hyper.map.pins.start.shadow);
		}else{
			if(!is_pin_dragging) setHeadingImage(start_pin, hyper.start, 'a');
			start_offscreen = true;
		}

		if( checkPinPos(hyper.end, end_pin) ){
			end_pin.setIcon(hyper.map.pins.end.icon);
			end_pin.setShadow(hyper.map.pins.end.shadow);
		}else{
			if(!is_pin_dragging) setHeadingImage(end_pin, hyper.end, 'b');
			end_offscreen = true;
		}

		if(start_offscreen || look_offscreen || end_offscreen) {

			var buffer_x = 35;
			var buffer_y = 40;
			var factor = Math.pow(2, map.getZoom());

			var cp = getPointFromLatLng( camera_pin.getPosition() );
			var sp = getPointFromLatLng( start_pin.getPosition() );
			var ep = getPointFromLatLng( end_pin.getPosition() );

			var d_cs_x = Math.abs( cp.x - sp.x );
			var d_cs_y = Math.abs( cp.y - sp.y );
			var d_ce_x = Math.abs( cp.x - ep.x );
			var d_ce_y = Math.abs( cp.y - ep.y );
			var d_se_x = Math.abs( sp.x - ep.x );
			var d_se_y = Math.abs( sp.y - ep.y );

			var corner_c = findCorner(camera_pin);
			var corner_s = findCorner(start_pin);
			var corner_e = findCorner(end_pin);

			if(d_cs_x < buffer_x*2 && d_ce_x < buffer_x && corner_c == CORNER_TOP_RIGHT) {
				cp.x = ep.x - buffer_x;
				sp.x = cp.x - buffer_x;
			} else if(d_cs_x < buffer_x && d_cs_y < buffer_y) {

				switch( corner_c ) {
					case CORNER_TOP_LEFT: case CORNER_BOT_LEFT: cp.x = sp.x + buffer_x; break;
					case CORNER_TOP_RIGHT: case CORNER_BOT_RIGHT: sp.x = cp.x - buffer_x; break;

					case CORNER_NONE:
						switch( findSide(start_pin) ) {
							case SIDE_TOP: case SIDE_BOTTOM: sp.x = cp.x - buffer_x; break;
							case SIDE_LEFT: case SIDE_RIGHT: sp.y = cp.y - buffer_y; break;
						}
					break;
				}

				if(d_ce_x < buffer_x*2 && d_ce_y < buffer_y) {
					switch( corner_c ) {
						case CORNER_TOP_LEFT: case CORNER_BOT_LEFT: ep.x = cp.x + buffer_x; break;

						case CORNER_TOP_RIGHT: case CORNER_BOT_RIGHT:
							sp.x -= buffer_x;
							cp.x -= buffer_x;
						break;

						case CORNER_NONE:
							switch( findSide(end_pin) ) {
								case SIDE_TOP: case SIDE_BOTTOM: ep.x = cp.x + buffer_x; break;
								case SIDE_LEFT: case SIDE_RIGHT: ep.y = cp.y + buffer_y; break;
							}
						break;
					}
				}
			} else if(d_ce_x < buffer_x && d_ce_y < buffer_y) {

				switch( corner_c ) {
					case CORNER_TOP_LEFT: case CORNER_BOT_LEFT: ep.x = cp.x + buffer_x; break;
					case CORNER_TOP_RIGHT: case CORNER_BOT_RIGHT: cp.x = ep.x - buffer_x; break;

					case CORNER_NONE:
						switch( findSide(end_pin) ) {
							case SIDE_TOP: case SIDE_BOTTOM: ep.x = cp.x + buffer_x; break;
							case SIDE_LEFT: case SIDE_RIGHT: ep.y = cp.y + buffer_y; break;
						}
					break;
				}

			} else if(d_se_x < buffer_x && d_se_y < buffer_y) {

				switch( corner_s ) {
					case CORNER_TOP_LEFT: case CORNER_BOT_LEFT: ep.x = sp.x + buffer_x; break;
					case CORNER_TOP_RIGHT: case CORNER_BOT_RIGHT: sp.x = ep.x - buffer_x; break;

					case CORNER_NONE:
						switch( findSide(end_pin) ) {
							case SIDE_TOP: ep.x = sp.x + buffer_x; break;
							case SIDE_BOTTOM: ep.x = sp.x + buffer_x; break;
							case SIDE_LEFT: ep.y = sp.y + buffer_y; break;
							case SIDE_RIGHT: ep.y = sp.y + buffer_y; break;
						}
					break;
				}

			}

			sp.x /= factor; sp.y /= factor;
			start_pin.setPosition( map.getProjection().fromPointToLatLng(sp) );

			cp.x /= factor; cp.y /= factor;
			camera_pin.setPosition( map.getProjection().fromPointToLatLng(cp) );

			ep.x /= factor; ep.y /= factor;
			end_pin.setPosition( map.getProjection().fromPointToLatLng(ep) );
		}

	};

	var setHyperPoints = function(el){
		var title = el.find('span').html();
		var start = el.attr('data-start').split( ',' );
		var look  = el.attr('data-look').split( ',' );
		var end   = el.attr('data-end').split( ',' );

		hyper.start = new google.maps.LatLng(start[0],start[1]);
		hyper.end = new google.maps.LatLng(look[0],look[1]);
		hyper.look = new google.maps.LatLng(end[0],end[1]);

		hyper.elevation = parseFloat( el.attr('data-elevation') );
		if(hyperlapse)
			hyperlapse.position.y = hyper.elevation;

		hyper.fov = parseFloat( el.attr('data-fov') );

		//$('#address').val(title);
		customTitleCard = true;
		titleCard(el);
	};

	var play = function(state){
		if (!hyper.ready) {return false;}
		state = (state) ? false : true;
		ui.player.state = state;
		if(state){

			$('#logos').show(function(){
				$(this).css('opacity', 0);
			});

			$('#credits').show(function(){
				$(this).css('opacity', 1);
			});

			hyperlapse.pause();
			pivot_pin.setVisible(false);

			$('#controls span').html('Press space to resume.');
		}else{

			$('#logos').css('opacity', 1);
			$('#credits').css('opacity', 0);
			setTimeout(function() {
				$('#logos').show();
				$('#credits').hide();
			}, 600);

			$('#controls').css('bottom',0);
			hyperlapse.play();
			pivot_pin.setVisible(true);

			$('#controls span').html('Press space to pause.');
		}
	};

	// let's initalize and take care of some UI items
	var playlistItems= $('.playlist ul li');

	$.each(playlistItems, function(i) {
		var $this = $(this);
		var img = $this.find('img');
		var imgSrc = img.attr('data-start');

		$this.css({
			'background' : 'url(img/previews/'+imgSrc+'.gif) no-repeat'
		});
	});

	var panoRandomInt = getRandomInt(0,(playlistItems.length-1));
	var panoRandomEl = playlistItems.eq(panoRandomInt);
	var panoBg = panoRandomEl.find('img').attr('data-start');
	// var panoBgCss = 'url(img/bg/'+panoBg+'.jpg) cover no-repeat 50% 50%';
	var panoBgCss = 'url(img/bg/'+panoBg+'.jpg)';
	// random bg image
	$('#pano').css('background-image',panoBgCss);

	function changeHash(reset) {
		if(reset) {
			window.location.hash = '';
		} else {
			window.location.hash = hyper.start.lat() + ',' +
				hyper.start.lng() + ',' +
				hyper.look.lat() + ',' +
				hyper.look.lng() + ',' +
				hyper.end.lat() + ',' +
				hyper.end.lng() + ',' +
				hyper.elevation + ',' +
				hyper.fov;
		}
	}

	if( window.location.hash ) {
		parts = window.location.hash.substr( 1 ).split( ',' );

		if(parts.length == 8) {
			hyper.start = new google.maps.LatLng(parts[0],parts[1]);
			hyper.look = new google.maps.LatLng(parts[2],parts[3]);
			hyper.end = new google.maps.LatLng(parts[4],parts[5]);
			hyper.elevation = parseFloat( parts[6] );
			hyper.fov = parseFloat( parts[7] );
		} else {
			changeHash(true);
			setHyperPoints(panoRandomEl);
		}

	} else {
		setHyperPoints(panoRandomEl);
	}

	setSliderWidth();

	$('.generate-wrapper').hide().removeClass('invisible');

	toggleGallery(ui.controls.controller.state);


	// google + maps + directions + geo coder
	var directionsPolylineOptions = new google.maps.Polyline({
		strokeColor: '#5bc09b',
		strokeOpacity: 0.7,
		strokeWeight: 7
	});

	map = new google.maps.Map(hyper.map.el, hyper.map.options);
	geocoder = new google.maps.Geocoder();
	directions_service = new google.maps.DirectionsService();
	directions_renderer = new google.maps.DirectionsRenderer({
		'draggable' : false,
		'polylineOptions' : directionsPolylineOptions,
		'markerOptions' : {
		'visible': false
		}
	});

	street_overlay = new google.maps.StreetViewCoverageLayer();
	streetview_service = new google.maps.StreetViewService();

	directions_renderer.setMap(map);
	directions_renderer.setOptions({preserveViewport:true});


	var pivot_pin = new RichMarker({
		position: hyper.start,
		flat : true,
		visible : false,
		zIndex : 10,
		content : '<div class="heading-wrapper"><div class="heading"></div></div>',
		map: map
	});

	var start_pin = new google.maps.Marker({
		position: hyper.start,
		draggable: true,
		zIndex : 100,
		shadow: hyper.map.pins.start.shadow,
		icon: hyper.map.pins.start.icon,
		map: map
	});

	var end_pin = new google.maps.Marker({
		position: hyper.end,
		draggable: true,
		zIndex : 100,
		shadow: hyper.map.pins.end.shadow,
		icon: hyper.map.pins.end.icon,
		map: map
	});

	var camera_pin = new google.maps.Marker({
		position: hyper.look,
		draggable: true,
		zIndex : 200,
		//shadow: hyper.map.pins.camera.shadow,
		icon: hyper.map.pins.camera.icon,
		raiseOnDrag : false,
		map: map
	});

	// fade in toggle and give time for map to render
	setTimeout(function() {
		toggleOverlay();
		getDirections(true);
	}, 200);

	// google map events
	google.maps.event.addListener(map, 'zoom_changed', function() {
		handlePinLocations();
	});

	google.maps.event.addListener(map, 'center_changed', function() {
		handlePinLocations();
	});


	google.maps.event.addListener(map, 'drag', function() {
		handlePinLocations();
	});


	var is_pin_dragging = false;

	google.maps.event.addListener (start_pin, 'mousedown', function () {
		if( !checkPinPos(hyper.start, start_pin) ){
			start_pin.setIcon(hyper.map.pins.start.icon);
			start_pin.setShadow(hyper.map.pins.start.shadow);
		}
		is_pin_dragging = true;
	});

	google.maps.event.addListener (start_pin, 'mouseup', function () {
		is_pin_dragging = false;
	});

	google.maps.event.addListener (end_pin, 'mousedown', function () {
		if( !checkPinPos(hyper.end, end_pin) ){
			end_pin.setIcon(hyper.map.pins.end.icon);
			end_pin.setShadow(hyper.map.pins.end.shadow);
		}
		is_pin_dragging = true;
	});

	google.maps.event.addListener (end_pin, 'mouseup', function () {
		is_pin_dragging = false;
	});

	google.maps.event.addListener (camera_pin, 'mousedown', function () {
		if( !checkPinPos(hyper.look, camera_pin) ){
			camera_pin.setIcon(hyper.map.pins.camera.icon);
			//camera_pin.setShadow(hyper.map.pins.camera.shadow);
		}
		is_pin_dragging = true;
	});

	google.maps.event.addListener (camera_pin, 'mouseup', function () {
		is_pin_dragging = false;
	});

	google.maps.event.addListener (camera_pin, 'drag', function () {
		hyper.look = camera_pin.getPosition();
		hyperlapse.setLookat(hyper.look, false);
	});


	google.maps.event.addListener (start_pin, 'dragstart', function (event) {
		dragPin();
	});

	google.maps.event.addListener (start_pin, 'dragend', function (event) {
		snapToRoad(start_pin.getPosition(), function(result) {
			if(result){
				start_pin.setPosition(result);
				hyper.start = result;
				getDirections();
			}else{
				start_pin.setPosition(hyper.start);
			}
			handlePinLocations();
			changeHash();
		});

		street_overlay.setMap(null);
		hyper.map.pins.drag = false;
		customTitleCard = false;
		titleCard();
	});


	google.maps.event.addListener (end_pin, 'dragstart', function (event) {
		dragPin();
	});

	google.maps.event.addListener (end_pin, 'dragend', function (event) {
		snapToRoad(end_pin.getPosition(), function(result) {
			if(result){
				end_pin.setPosition(result);
				hyper.end = result;
				getDirections();
			}else{
				end_pin.setPosition(hyper.end);
			}
			handlePinLocations();
			changeHash();
		});

		street_overlay.setMap(null);
		hyper.map.pins.drag = false;
		customTitleCard = false;
		titleCard();
	});

	google.maps.event.addListener (camera_pin, 'dragend', function (event) {
		hyper.look = camera_pin.getPosition();
		hyperlapse.setLookat(hyper.look, true);
		handlePinLocations();
		changeHash();
	});

	TWEEN.start();

	// Hyperlapse
	hyperlapse = new Hyperlapse(hyper.pano.el, {
		lookat: hyper.look,
		fov: hyper.fov,
		millis: 60,
		width: window.innerWidth,
		height: window.innerHeight,
		zoom: 2,
		use_lookat: true,
		distance_between_points: 5,
		max_points: 75,
		elevation: hyper.elevation,
		use_elevation: true
	});

	hyperlapse.position.y = hyper.elevation; // REMOVE THIS

	// hyperlapse events
	hyperlapse.onLoadComplete = function(e) {
		$('.overlay').attr('data-state', false);
		// hide shit
		$('.loading').hide();
		$('.expand, .generate-wrapper').show();
		$('.progress .bar').width('0%');

		toggleOverlay();
		hyper.ready = true;
		setTimeout(function() {
			$('.expand').show();
			$('#pano').addClass('active');
			play(true);
		}, 500);
	};

	hyperlapse.onRouteProgress = function(e) {
		var p = Math.floor((hyperlapse.length()/160)*100);
		$('.progress .bar').width(p+'%');
	};

	hyperlapse.onRouteComplete = function(e) {
		hyperlapse.load();
		tips();
	};

	hyperlapse.onLoadProgress = function(e) {
		var p = (Math.floor( ((e.position+1) / hyperlapse.length() )*100) / 2) + 50;
		$('.progress .bar').width(p+'%');
	};

	hyperlapse.onLoadCanceled = function(e) {
		$('.generate-wrapper').fadeTo(200, 1);
		$('.loading').fadeTo(200, 0);

		setTimeout(function() {
			$('.overlay').attr('data-state', true);
			$('.loading').hide();
			$('.progress .bar').width('0%');
			toggleOverlay(true);
		}, 200);
	};

	hyperlapse.onFrame = function(e) {

		attribution = e.point.copyright + ". Image Date: " + e.point.image_date;
		$('#controls p').html(attribution);

		var lookDeg = google.maps.geometry.spherical.computeHeading( e.point.location ,  hyper.look );
		var m = ( e.position / hyperlapse.length() ) * 100;
		pivot_pin.setPosition(e.point.location);

		var tween = new TWEEN
			.Tween( hyper )
			.to( { slider_p: m }, hyperlapse.millis )
			.easing(TWEEN.Easing.Linear.EaseNone)
			.onUpdate( function() {
				$('#slider .head').css('margin-left', this.slider_p+'%');
			} )
			.start();

		$('.heading').css({
			'-webkit-transform' : 'rotate('+lookDeg+'deg)',
			'-mov-transform'    : 'rotate('+lookDeg+'deg)',
			'transform'         : 'rotate('+lookDeg+'deg)'
		});
	};

	// events
	$(window).resize(function() {
		hyperlapse.setSize(window.innerWidth, window.innerHeight);
		setSliderWidth();

		var overlay = $('.overlay');
		var state = (overlay.attr('data-state') === 'true') ? true : false;
		var viewportWidth  = $(window).width()  - 72 - $('#credits').outerWidth();
		var viewportHeight = $(window).height() - 50;
		var expanded = (viewportWidth < viewportHeight) ? viewportWidth : viewportHeight;
		var closed = '300px';

		if(state){
			overlay.css({
				'width':  closed,
				'height': closed,
				'padding-bottom': '42px'
			});
			$('#map, .map-cover').css({
				'width':  closed,
				'height': closed
			});
		}else{
			overlay.css({
				'width':  expanded,
				'height': expanded,
				'padding-bottom': '0'
			});
			$('#map, .map-cover').css({
				'width':  expanded,
				'height': (expanded-100)
			});
		}

		google.maps.event.trigger(map, "resize");
		mapCenterPoints(false);
		handlePinLocations();
		setPlaylistHeight();

		playlistResizer();
	});

	$('.overlay .expand').click(function(e) {
		$('.generate-wrapper').fadeTo(200, 1);
		toggleOverlay();
		// $('.overlay').css('padding-bottom', '0');
		// resizer();
	});

	$('#search').click(function(e){
		e.preventDefault();
		searchMap();
	});

	$('#cancel').click(function(e){
		e.preventDefault();
		hyperlapse.cancel();
	});

	$('#address').bind('keypress', function(e) {
		var code = (e.keyCode ? e.keyCode : e.which);
		if(code == 13) {
			searchMap();
		}
	});

	// Hyperlapse button event
	$('#generate').click(function(e){
		e.preventDefault();
		hyperlapse.lookat = hyper.look;
		hyperlapse.elevation_offset = hyper.elevation;
		hyperlapse.setFOV( hyper.fov );
		hyperlapse.generate({route:hyper.route});

		// hide
		$('.loading').fadeTo(200, 1);
		$('.generate-wrapper').fadeTo(200, 0);
		toggleGallery(false);
		$('.expand').hide();
	});

	$('.fancybox-media').click(function() {
		hyperlapse.cancel();
	});

	// player events
	$('#gallery').click(function(e){
		e.preventDefault();
		toggleGallery(true);
		playlistResizer();
	});

	$('.close-list').click(function(e){
		toggleGallery(false);
	});

	$(document).keyup(function(evt) {
		if (evt.keyCode == 32) {
			play(ui.player.state);
		}
	});

	$('#play').click(function(){
		play(ui.player.state);
	});

	$('.playlist').on('click', 'li', function(e) {
		e.preventDefault();
		// Act on the event
		var $this = $(this);

		setHyperPoints($this);
		changeHash(true);

		toggleGallery(false);

		start_pin.setPosition(hyper.start);
		camera_pin.setPosition(hyper.look);
		end_pin.setPosition(hyper.end);
		pivot_pin.setPosition(hyper.start);

		mapCenterPoints();
		handlePinLocations();

		getDirections(true);
	});

	var customTitleCard = true;

	function titleCard(x) {
		if (customTitleCard && x) {
			var title = $(x).find('span').html();
			$('.map-cover h3:first-child').html('Loading Hyperlapse');
			$('.map-cover h1').html(title);
		} else {
			$('.map-cover h3:first-child').html('&nbsp;');
			$('.map-cover h1').html('Loading Hyperlapse');
		}
	}

	function mousewheel( e ) {
		var overlay = $('.overlay');
		var state = (overlay.attr('data-state') === 'true') ? true : false;

		if(state) {
			e = e ? e : window.event;
			var nfov = hyper.fov - ( e.detail ? e.detail * -1 : e.wheelDelta / 32 );
			if(nfov >= 30 && nfov <= 130) {
				hyper.fov = nfov;
				hyperlapse.setFOV(nfov);
				changeHash();
			}
		}
	}

	hyper.pano.el.addEventListener( 'mousewheel', mousewheel, false );
	hyper.pano.el.addEventListener( 'DOMMouseScroll', mousewheel, false);

	// look events
	$('#pano').mousedown(function(e) {
		e.preventDefault();

		var overlay = $('.overlay');
		var state = (overlay.attr('data-state') === 'true') ? true : false;

		if(state) {
			hyper.pano.moving = true;

			hyper.pano.pointer.x = e.clientX;
			hyper.pano.pointer.y = e.clientY;

			hyper.pano.x = hyperlapse.position.x;
			hyper.pano.y = hyperlapse.position.y;

			$('#pano').addClass('dragging');
		}

	});

	$('#pano').mouseup(function(e) {
		e.preventDefault();

		var overlay = $('.overlay');
		var state = (overlay.attr('data-state') === 'true') ? true : false;

		if(state) {
			hyper.pano.moving = false;

			var tween = new TWEEN
				.Tween( hyperlapse.position )
				.to( { x: 0 }, 300 )
				.easing(TWEEN.Easing.Cubic.EaseInOut)
				.start();

			hyper.elevation = hyperlapse.position.y;
			changeHash();

			$('#pano').removeClass('dragging');
		}
	});

	$('#pano').mousemove(function(e) {
		e.preventDefault();

		var overlay = $('.overlay');
		var state = (overlay.attr('data-state') === 'true') ? true : false;

		if(state) {
			var f = hyper.fov / 500;

			if (hyper.pano.moving){
				var dx = ( hyper.pano.pointer.x - e.clientX ) * f;
				var dy = ( e.clientY - hyper.pano.pointer.y ) * f;
				hyperlapse.position.x = hyper.pano.x + dx; // reversed dragging direction (thanks @mrdoob!)
				hyperlapse.position.y = hyper.pano.y + dy;
			}
		}

	});

	$(document).on('transitionend', function() {
		resizer();
		playlistResizer();
	});

	$('#controls').append('<p>© 2013 Google.</p>');

	$('#pano-button').click(function(){
		alert("Saving Hyperlapse");

		var pointArray = hyperlapse.hPoints();

		for(i=0; i < pointArray.length; i++){

			var req = new XMLHttpRequest();

			// open a POST request to our backend
			req.open('post', '../export/saveframe.php');

			// capture the data URL of the image
			var data = pointArray[i].image.toDataURL();

			// encode the data along with the frame identifier (and increment it)
			//data = 'data=' + encodeURIComponent(data) + '&i=' + counter++;
			data = 'data=' + encodeURIComponent(data) + '&i=' + i;

			// set the appropriate request headers
			req.setRequestHeader("Content-type", "application/x-www-form-urlencoded");

			// send the data
			req.send(data);
		}
		alert("Hyperlapse saved");
		});
});
