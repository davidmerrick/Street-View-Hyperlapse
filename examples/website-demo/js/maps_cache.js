custom_stringify = function(name, value){
	if (/^(lat_lngs|path|overview_path)/.test(name)) {
		return google.maps.geometry.encoding.encodePath(value);
	} else if (value instanceof google.maps.LatLng){
		return 'LL(' + value.lat() + ',' + value.lng() + ')';
	} else if (value instanceof google.maps.LatLngBounds){
		return 'LB(' +
			value.getSouthWest().lat() + ',' + value.getSouthWest().lng() + ',' +
			value.getNorthEast().lat() + ',' + value.getNorthEast().lng() + ')';
	} else {
		return value;
	}
};

custom_parse = function(name, value){
	var match;
	if (/^(lat_lngs|path|overview_path)/.test(name)) {
		return google.maps.geometry.encoding.decodePath(value);
	} else if (/^LL\(/.test(value)){
		match = /LL\(([^,]+),([^,]+)\)/.exec(value);
		return new google.maps.LatLng(match[1], match[2]);
	} else if (/^LB\(/.test(value)){
		match = /LB\(([^,]+),([^,]+),([^,]+),([^,]+)\)/.exec(value);
		return new google.maps.LatLngBounds(new google.maps.LatLng(match[1], match[2]),
											new google.maps.LatLng(match[3], match[4]));
	} else{
		return value;
	}
};

_S = function(obj){
	return JSON.stringify(obj, custom_stringify);
};

_US = function(str){
	return JSON.parse(str, custom_parse);
};

getRoute = function(directions_service, request, callback) {
	var cache_call = new XMLHttpRequest();
	cache_call.onload = function reqListener () {

		try {
			var json = JSON.parse(this.responseText);

			if(json.status === 0) {

				directions_service.route(request, function(response, status) {
					if (status == google.maps.DirectionsStatus.OK) {
						var pack = {
							"key":params,
							"data":response
						};

						var s_json = _S(pack);

						var xmlhttp = new XMLHttpRequest();
						xmlhttp.open("POST", "/route");
						xmlhttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
						xmlhttp.send(s_json);

						callback(response, status);
					} else {
						callback(response, status);
					}
				});
			} else {

				var response = _US(json.data);
				callback(response, google.maps.DirectionsStatus.OK);

			}
		} catch(e) {
			callback(null, google.maps.DirectionsStatus.UNKNOWN_ERROR);
		}
	};

	var params = request.origin.lat()+","+request.origin.lng()+","+request.destination.lat()+","+request.destination.lng();
	cache_call.open("get", "/route?ll="+params, true);
	cache_call.send();
};