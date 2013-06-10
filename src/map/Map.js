import device;
import animate;
import ui.View as View;
import ui.ImageView as ImageView;
import ui.resource.Image as Image;

/**
 * Map view with Open Street Map
 *
 * @event ZoomChange  zoom value
 */
exports = Class(View, function (supr) {

  /**
   * Constructor
   *
   * @param  object opts        View's options
   * @param  object mapSettings Map settings (override)
   */
  this.init = function (opts, mapSettings) {

    this.settings = merge(mapSettings, {
      // Width and height of each tile
      tilesize: 256 * device.screen.devicePixelRatio,
      // Min zoom (0-18)
      zMin: 2,
      // Max zoom (0-18)
      zMax: 18,
      // Initial position: latitude, longitude, zoom
      position: {
        lat: 47.233,
        lon: -1.583,
        z: 10
      },
      // Width (in pixels) of the zone outside the map where images should be loaded
      overflow: 50,
      // Duration of animation (while zooming)
      animationsDuration: 100,
      // Number of tiles to keep in cache
      maxTilesCache: 500,
      // Constructor of tiles URLs. Override it to use another API
      tileProvider: function (x, y, z) {
        return "http://" + ["a", "b", "c"][Math.random() * 3 | 0] + ".tile.openstreetmap.org/" + z + "/" + x + "/" + y + ".png";
      }
    });

    // Latitude and longitude boundaries of displayed map
    this.bounds = {
      latTop: 0,
      latBottom: 0,
      lonRight: 0,
      lonLeft: 0
    };

    // List of current animations used to clear them
    this.animations = [];

    // List of objects displayed on the map
    this.objects = [];

    // Reset configuration of next refresh
    this._resetRefreshConfig();

    // View's options
    opts = merge(opts, {
      backgroundColor: "#EEEEEE",
      clip: true
    });
    supr(this, "init", [opts]);
  };


  /**
   * Set events and display map
   */
  this.buildView = function () {
    var that = this;
    this._refreshOnTick();

    // Mousewheel event (browser only) for zooming
    var canvas = GC.app.engine.getCanvas();
    if (canvas.addEventListener) {
      this.mouseWheelEvent = function (event) {
        event = event || window.event;
        var mouse = {
          x: event.clientX,
          y: event.clientY
        };
        var mapPosition = that.getPosition();

        // Ignore event if the mouse is outside the map
        if (mouse.x < mapPosition.x || mouse.x > mapPosition.x + mapPosition.width
         || mouse.y < mapPosition.y || mouse.y > mapPosition.y + mapPosition.height) {
          return;
        }

        var delta = 0;
        if (event.wheelDelta) {
          delta = event.wheelDelta / 120;
          if (window.opera) {
            delta = -delta;
          }
        } else if (event.detail) {
          delta = -event.detail / 3;
        }
        // Zoom
        if (delta != 0) {
          that.zoomByStep(delta / 10);
        }
        event.preventDefault();
        event.stopPropagation();
      };
      canvas.addEventListener("DOMMouseScroll", this.mouseWheelEvent, false);
      canvas.addEventListener("mousewheel", this.mouseWheelEvent, false);
    }

    // Drag event for moving
    this.on("Drag", function (dragEvent, moveEvent, delta) {
      var zoom = Math.ceil(that.settings.position.z);
      // Current tiles' size
      var tilesize = that.settings.tilesize * that._computeScale(zoom);
      // X and Y position from longitude and latitude
      var tileX = lon2x(that.settings.position.lon, zoom);
      var tileY = lat2y(that.settings.position.lat, zoom);
      // Latitude and longitude from Y and X position, adding delta of Drag
      var lat = y2lat(tileY - delta.y / tilesize, zoom);
      var lon = x2lon(tileX - delta.x / tilesize, zoom);
      this.setPosition(lat, lon);
    });
    this.on("InputStart", function (evt){
      that.startDrag({
        inputStartEvt: evt
      });
    });

  };

  this.tick = function () {
    if (this._refreshConfig.refreshOnTick) {
      this._refresh();
    }
  }


  /**
   * Remove the map from its superview and remove events
   */
  this.remove = function () {
    var canvas = GC.app.engine.getCanvas();
    if (canvas.removeEventListener) {
      canvas.removeEventListener("DOMMouseScroll", this.mouseWheelEvent);
      canvas.removeEventListener("mousewheel", this.mouseWheelEvent);
    }
    this.removeFromSuperview();
  };


  /**
   * Add an object on the map
   *
   * @param  View object
   */
  this.addObject = function (object) {
    object.hasSuperview = false;
    this.objects.push(object);
  };

  /**
   * Remove all objects
   */
  this.clearObjects = function () {
    for (var i = this.objects.length - 1; i >= 0; i--) {
      this.objects[i].removeFromSuperview();
    }
    this.objects = [];
  };


  /**
   * Set new latitude, longitude and zoom
   * and refresh map
   *
   * @param  Number lat Latitude
   * @param  Number lon Longitude
   * @param  Number z   Zoom (optional)
   */
  this.setPosition = function (lat, lon, z) {
    this.settings.position.lat = lat;
    this.settings.position.lon = lon;
    if (z != null) {
      this.settings.position.z = z;
    }
    this._refreshOnTick();
  };


  /**
   * Change zoom and refresh map
   *
   * @param  Number zoom     New zoom value
   * @param  Number zoomStep Zoom delta (optional)
   */
  this.zoom = function (zoom) {
    zoom = Math.max(Math.min(zoom, this.settings.zMax), this.settings.zMin);
    var delta = this.settings.position.z - zoom;
    this.settings.position.z = zoom;
    this._refreshConfig = {
      enableAnimations: true,
      zoomDirection: (delta ? (delta > 0 ? 1 : -1) : 0)
    };
    this._refreshOnTick();
    this.emit("ZoomChange", zoom);
  };

  /**
   * Increase or decrease zoom and refresh map
   *
   * @param  Number step Delta
   */
  this.zoomByStep = function (step) {
    this.zoom(this.settings.position.z + step);
  };


  /**
   * Refresh on next tick
   */
  this._refreshOnTick = function () {
    this._refreshConfig.refreshOnTick = true;
  };

  /**
   * Reset configuration of refresh
   */
  this._resetRefreshConfig = function () {
    this._refreshConfig = {
      refreshOnTick: false,
      enableAnimations: false,
      zoomDirection: 0
    }
  };

  /**
   * Refresh map
   *
   * We use two layers, one for current zoom and one for previous zoom,
   * assuming that previous zoom tiles were already loaded. Therefore we
   * always have tiles to show and we obtain a smooth effect.
   */
  this._refresh = function () {
    var z = Math.ceil(this.settings.position.z);
    var z2 = z + this._refreshConfig.zoomDirection;

    // Abort all non completed animations
    this._clearAnimations();

    // Compute latitude and longitude boundaries
    this._computeBoundaries();

    // Retrieve layers if they already exist
    var layer, layer2, objectsView, i;
    var views = this.getSubviews();
    for (i = views.length - 1; i >= 0; i--) {
      if (views[i].isLayer) {
        // Current zoom layer
        if (views[i].zoom == z) {
          layer = views[i];
        // Previous zoom layer
        } else if (z != z2 && views[i].zoom == z2) {
          layer2 = views[i];
        // Delete layer if it's not useful anymore
        } else if (views[i].isLayer) {
          views[i].removeFromSuperview();
        }
      } else if (views[i].objectsView) {
        objectsView = views[i];
      }
    }

    // Create current zoom layer if it doesn't exist
    if (!layer) {
      layer = new View({
        superview: this,
        width: this.style.width,
        height: this.style.height
      });
      layer.isLayer = true;
      layer.zoom = z;
    }

    if (z != z2) {
      // Create previous zoom layer if it doesn't exist
      if (!layer2) {
        layer2 = new View({
          superview: this,
          width: this.style.width,
          height: this.style.height
        });
        layer2.isLayer = true;
        layer2.zoom = z2;
      }
      layer2.style.zIndex = 1;
      // Load tiles
      this._loadLayer(layer2, z2, true);
    }
    layer.style.zIndex = 2;
    // Load tiles
    this._loadLayer(layer, z, false, function () {
      // When current zoom layer is loaded, delete previous zoom layer
      if (layer2) {
        layer2.isLayer = false;
        setTimeout(function () {
          layer2.removeFromSuperview();
        }, 500);
      }
    });

    // Show all objects on the map
    if (!objectsView) {
      objectsView = new View({
        superview: this,
        width: this.style.width,
        height: this.style.height,
        zIndex: 3
      });
      objectsView.objectsView = true;
    }
    this._showObjects(objectsView);

    this._resetRefreshConfig();
  };


  /**
   * Load tiles of a layer
   *
   * @param  View     layer           Layer's view
   * @param  Number   zoom            Zoom
   * @param  Boolean  cacheonly       Use only tiles in cache if true
   * @param  Function onload          Callback called when all tiles are loaded
   */
  this._loadLayer = function (layer, zoom, cacheonly, onload) {
    var that = this;
    // Current tiles' size
    var tilesize = this.settings.tilesize * that._computeScale(zoom);
    // X,Y position (API) of map's center
    var centerTileX = lon2x(this.settings.position.lon, zoom);
    var centerTileY = lat2y(this.settings.position.lat, zoom);
    var centerTileXFloor = centerTileX | 0;
    var centerTileYFloor = centerTileY | 0;
    // x,y position (pixels) of the center tile
    var centerX = this.style.width / 2 - (centerTileX - centerTileXFloor) * tilesize;
    var centerY = this.style.height / 2 - (centerTileY - centerTileYFloor) * tilesize;
    // Number of tiles at the left of the center tile
    var nTilesLeft = Math.ceil((this.settings.overflow + centerX) / tilesize);
    // x position of the leftmost tile
    var minX = centerX - nTilesLeft * tilesize;
    // Min and max X position (API) values
    var minTileX = centerTileXFloor - nTilesLeft;
    var maxTileX = centerTileXFloor + Math.ceil((this.style.width + this.settings.overflow - centerX) / tilesize - 1);
    // Number of tiles on top of the center tile
    var nTilesTop = Math.ceil((this.settings.overflow + centerY) / tilesize);
    // x position of the uppermost tile
    var minY = centerY - nTilesTop * tilesize;
    // Min and max Y position (API) values
    var minTileY = centerTileYFloor - nTilesTop;
    var maxTileY = centerTileYFloor + Math.ceil((this.style.height + this.settings.overflow - centerY) / tilesize - 1);
    // List of tiles ImageViews
    var imageViews = [];
    // List of configured tiles
    var configuredTiles = {};

    /**
     * Load a tile's image and create an ImageView
     *
     * @param  Number tileX  X position
     * @param  Number tileY   position
     * @return ImageView
     */
    var loadTile = function (tileX, tileY) {
      var imageView;
      var image = that._getTile(tileX, tileY, zoom, cacheonly);
      if (image) {
        imageView = new ImageView({
          superview: layer,
          image: image
        });
        imageView.tileX = tileX;
        imageView.tileY = tileY;
      }
      return imageView;
    };

    /**
     * Position a tile in its layer
     * Begin an animation if needed
     *
     * @param  ImageView imageView Tile's ImageView
     * @param  Boolean   isNew     True if it's a new tile
     */
    var positionTile = function (imageView, isNew) {
      var animation;
      if(that._refreshConfig.enableAnimations) {
        animation = that._animate(imageView);
      }
      // Style to apply to the tile
      var style = {
        opacity: 1,
        width: tilesize,
        height: tilesize,
        x: minX + (imageView.tileX - minTileX) * tilesize,
        y: minY + (imageView.tileY - minTileY) * tilesize
      };
      // If the tile is new, apply style directly,
      // and animate fade in (if animations are enabled)
      if (isNew) {
        imageView.style.update(style);
        if (that._refreshConfig.enableAnimations) {
          imageView.style.opacity = 0;
          animation.then({opacity: 1}, that.settings.animationsDuration);
        }
      // Else, animate (if animations are enabled)
      } else {
        if(that._refreshConfig.enableAnimations) {
          animation.then(style, that.settings.animationsDuration);
        } else {
          imageView.style.update(style);
        }
      }
      configuredTiles[imageView.tileX + "," + imageView.tileY] = true;
    };

    // Keep tiles that are already present and position them
    // Delete tiles that are now useless
    var views = layer.getSubviews();
    for (var i = views.length - 1; i >= 0; i--) {
      if (views[i].tileX >= minTileX && views[i].tileX <= maxTileX
       && views[i].tileY >= minTileY && views[i].tileY <= maxTileY) {
        positionTile(views[i]);
        imageViews.push(views[i]);
      } else {
        views[i].removeFromSuperview();
      }
    }

    // Create tiles that don't already exist
    for (var tileX = minTileX; tileX <= maxTileX; tileX++) {
      for (var tileY = minTileY; tileY <= maxTileY; tileY++) {
        if (!((tileX + "," + tileY) in configuredTiles)) {
          var imageView = loadTile(tileX, tileY);
          if (imageView) {
            positionTile(imageView, true);
            imageViews.push(imageView);
          }
        }
      }
    }

    // Call "onload" callback when all images are loaded
    if (typeof(onload) == "function") {
      var nToLoad = imageViews.length;
      for (i = imageViews.length - 1; i >= 0; i--) {
        imageViews[i].doOnLoad(function () {
          nToLoad--;
          if (nToLoad == 0) {
            onload();
          }
        });
      }
    }
  };


  /**
   * Show all objects that are included in map boundaries
   *
   * @param  View view  Objects' view
   */
  this._showObjects = function (view) {
    var latHeight = this.bounds.latBottom - this.bounds.latTop;
    var lonWidth = this.bounds.lonRight - this.bounds.lonLeft;
    for (var i = this.objects.length - 1; i >= 0; i--) {
      var object = this.objects[i];
      if (this.settings.position.z >= 10
       && object.settings.lat <= this.bounds.latTop && object.settings.lat >= this.bounds.latBottom
       && object.settings.lon <= this.bounds.lonLeft && object.settings.lon >= this.bounds.lonRight) {

        var style = {
          x: this.style.width * (1 - (object.settings.lon - this.bounds.lonLeft) / lonWidth),
          y: this.style.height * (object.settings.lat - this.bounds.latTop) / latHeight
        };

        if (object.hasSuperview && this._refreshConfig.enableAnimations) {
          var animation = this._animate(object);
          animation.then(style, this.settings.animationsDuration);
        } else {
          object.style.update(style);
        }

        if (!object.hasSuperview) {
          view.addSubview(object);
          object.hasSuperview = true;
        }

      } else if (object.hasSuperview) {
        object.removeFromSuperview();
        object.hasSuperview = false;
      }
    }
  };


  /**
   * Scale of images (1 is normal size) based on current zoom
   *
   * @param  Number zoom  Zoom of a layer (integer)
   * @return Number       Scale
   */
  this._computeScale = function (zoom) {
    return pow(2, this.settings.position.z) / pow(2, zoom);
  };


  /**
   * Compute latitude and longitude boundaries of the map
   * and store them into this.bounds
   */
  this._computeBoundaries = function () {
    var zoom = Math.ceil(this.settings.position.z)
    // Current tiles' size
    var tilesize = this.settings.tilesize * this._computeScale(zoom);
    // X and Y position from longitude and latitude
    var centerX = lon2x(this.settings.position.lon, zoom);
    var centerY = lat2y(this.settings.position.lat, zoom);
    // Latitude and longitude boundaries of displayed map
    this.bounds = {
      latTop: y2lat(centerY - this.style.height / 2 / tilesize, zoom),
      latBottom: y2lat(centerY + this.style.height / 2 / tilesize, zoom),
      lonRight: x2lon(centerX - this.style.width / 2 / tilesize, zoom),
      lonLeft: x2lon(centerX + this.style.width / 2 / tilesize, zoom)
    };
  };


  /**
   * Load and cache the image of a tile
   *
   * @param  Number x           X position in API
   * @param  Number y           Y position in API
   * @param  Number z           Z position in API
   * @param  Boolean cacheonly  If true, don't load image if not in cache
   * @return Image
   */
  this._getTile = function (x, y, z, cacheonly) {
    var cacheKey = x + "," + y + "," + z;
    if (!tilesCache[cacheKey] && !cacheonly) {
      tilesCache[cacheKey] = new Image({
        url: this.settings.tileProvider(x, y, z)
      });
      tilesCacheKeys.push(cacheKey);

      // Destroy images that are not yet loaded and that we don't need immediatly
      for (var i = tilesCacheKeys.length - 50; i >= 0; i--) {
        var image = tilesCache[tilesCacheKeys[i]];
        if (!image.isReady()) {
          try {
            image.destroy();
          }catch(e){}
          delete tilesCache[tilesCacheKeys.splice(i, 1)[0]];
        }
      }

      // Delete first cache entry if we reached maximum number of entries
      while (tilesCacheKeys.length > this.settings.maxTilesCache) {
        tilesCache[tilesCacheKeys.shift()].destroy();
        delete tilesCache[tilesCacheKeys.shift()];
      }
    }
    return tilesCache[cacheKey];
  };


  /**
   * Create an animate object for a view
   *
   * @param  View view
   * @return ViewAnimator
   */
  this._animate = function (view) {
    var animation = animate(view);
    this.animations.push(animation);
    return animation;
  };

  /**
   * Clear all tiles animations
   */
  this._clearAnimations = function () {
    for (var i = this.animations.length - 1; i >= 0; i--) {
      this.animations[i].clear();
    }
    this.animations = [];
  };



  /**
   * Private static variables and methods
   */

  // Cache of tiles images
  var tilesCache = {};
  var tilesCacheKeys = [];

  // Convert latitude to y position
  var lat2y = function (lat, z) {
    return pow(2, z) * (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2;
  };
  // Convert longitude to x position
  var lon2x = function (lon, z) {
    return pow(2, z) * (lon + 180) / 360;
  };
  // Convert x position to longitude
  var x2lon = function (x, z) {
    return (x / pow(2, z) * 360 - 180);
  };
  // Convert y position to latitude
  var y2lat = function (y, z) {
    var n = Math.PI - 2 * Math.PI * y / pow(2, z);
    return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
  };

  // Compute a power operation and cache it
  var pow = function (base, exp) {
    if (!powCache[base]) {
      powCache[base] = {};
    }
    if (typeof(powCache[base][exp]) == "undefined") {
      powCache[base][exp] = Math.pow(base, exp);
    }
    return powCache[base][exp];
  };
  var powCache = {};

});
