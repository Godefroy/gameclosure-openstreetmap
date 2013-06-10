import device;
import ui.TextView as TextView;
import ui.widget.SliderView as SliderView;

import src.map.Map as Map;
import src.map.MapMarker as MapMarker;

exports = Class(GC.Application, function() {

  this.initUI = function() {

    /**
     * Example of Map usage
     */

    // Configuration of the map
    var mapConfig = {
      zMin: 2,
      zMax: 18,
      position: {
        lat: 47.20696,
        lon: -1.560413,
        z: 17
      }
    };

    // Init map
    var map = new Map({
      superview: this,
      width: device.width,
      height: device.height,
      zIndex: 1
    }, mapConfig);

    // Add a marker on the map
    new MapMarker({}, {
      map: map,
      lat: 47.20696,
      lon: -1.560413
    });

    // Show a slider to handle zoom when there's no mouse wheel
    var sliderView = new SliderView({
      superview: this,
      x: device.width - 40 * device.screen.devicePixelRatio,
      y: 50 * device.screen.devicePixelRatio,
      zIndex: 2,
      width: 30 * device.screen.devicePixelRatio,
      height: device.height - 100 * device.screen.devicePixelRatio,
      thumbSize: 30 * device.screen.devicePixelRatio,
      minValue: -mapConfig.zMax * 100,
      maxValue: -mapConfig.zMin * 100,
      value: -mapConfig.position.z * 100,
      track: {
        activeColor: "#DDDDDD",
      },
      thumb: {
        activeColor: "#AAAAAA",
        pressedColor: "#AAAAAA"
      }
    });
    var ignoreZoomChange = false;
    sliderView.on("Change", function (value) {
      if (ignoreZoomChange) {
        ignoreZoomChange = false;
      } else {
        map.zoom(-value / 100);
      }
    });
    map.on("ZoomChange", function (value) {
      ignoreZoomChange = true;
      sliderView.setValue(-value * 100);
    });

    // Show "+" and "-" on the slider
    new TextView({
      superview: this,
      text: "+",
      x: device.width - 40 * device.screen.devicePixelRatio,
      y: 20 * device.screen.devicePixelRatio,
      zIndex: 2,
      width: 30 * device.screen.devicePixelRatio,
      height: 30 * device.screen.devicePixelRatio,
      size: 20 * device.screen.devicePixelRatio,
      fontWeight: "bold",
      color: "#555555",
      verticalAlign: "middle",
      horizontalAlign: "center"
    });
    new TextView({
      superview: this,
      text: "-",
      x: device.width - 40 * device.screen.devicePixelRatio,
      y: device.height - 50 * device.screen.devicePixelRatio,
      zIndex: 2,
      width: 30 * device.screen.devicePixelRatio,
      height: 30 * device.screen.devicePixelRatio,
      size: 20 * device.screen.devicePixelRatio,
      fontWeight: "bold",
      color: "#555555",
      verticalAlign: "middle",
      horizontalAlign: "center"
    });

  };

  this.launchUI = function() {};
});