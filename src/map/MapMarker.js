import device;
import ui.ImageView as ImageView;

/**
 * Map marker for Map class
 */
exports = Class(ImageView, function (supr) {

  /**
   * Constructor
   *
   * @param  object opts        View's options
   * @param  object settings    Marker settings (override)
   */
  this.init = function (opts, settings) {
    if (!("map" in settings)) {
        throw new Error("MapMarker - Missing parameter: map");
    }
    if (!("lat" in settings)) {
        throw new Error("MapMarker - Missing parameter: lat");
    }
    if (!("lon" in settings)) {
        throw new Error("MapMarker - Missing parameter: lon");
    }
    this.settings = settings;

    // View's options
    opts = merge(opts, {
        image: "resources/images/map-marker.png",
        width: 32 * device.screen.devicePixelRatio,
        height: 32 * device.screen.devicePixelRatio,
        offsetX: - 16 * device.screen.devicePixelRatio,
        offsetY: - 32 * device.screen.devicePixelRatio
    });
    supr(this, "init", [opts]);

    settings.map.addObject(this);
  };

});