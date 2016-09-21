sGis.module('Map', [
    'utils',
    'Crs',
    'EventHandler',
    'Point',
    'Bbox',
    'LayerGroup',
    'feature.Point'
], function(utils, Crs, EventHandler, Point, Bbox, LayerGroup, PointF) {
    'use strict';

    let defaults = {
        _crs: sGis.CRS.webMercator,
        _position: new sGis.Point([55.755831, 37.617673]).projectTo(sGis.CRS.webMercator),
        _resolution: 611.4962262812505 / 2,
        _animationTime: 300,
        _tileScheme: null
    };

    /**
     *
     * @alias sGis.Map
     * @extends sGis.LayerGroup
     * @param {Object} [options]
     * @param {sGis.Crs} [options.crs=sGis.CRS.webMercator] - setting a crs that cannot be converted into WGS resets default values of position to [0, 0].
     * @param {sGis.Point|sGis.feature.Point|Array} [options.position] - the start position of the map. If the array is specified as [x, y], it should be in map crs. By default center it is of Moscow.
     * @param {Number} [options.resolution=305.74811] - initial resolution of the map
     * @param {String} [options.wrapper] - Id of the DOM container that will contain the map. It should be block element. If not specified, the map will not be displayed.
     * @param {sGis.Layer} [options.layers[]] - the list of layers that will be initially on the map. The first in the list will be displayed at the bottom.
     * @constructor
     */
    class Map extends LayerGroup {
        constructor(properties) {
            super();
            if (properties && properties.crs) this.crs = properties.crs;
            utils.init(this, properties);
            
            this._listenForBboxChange();
        }
        
        _listenForBboxChange () {
            this.on('bboxChange', function () {
                var map = this;
                var CHANGE_END_DELAY = 300;
                if (map._changeTimer) clearTimeout(map._changeTimer);
                map._changeTimer = setTimeout((function (map) {
                    return function () {
                        map.fire('bboxChangeEnd', {map: map});
                        map._changeTimer = null;
                    };
                })(map), CHANGE_END_DELAY);
            });
        }

        /**
         * Moves the map position by the specified offset
         * @param {Number} dx - Offset along X axis in map coordinates, positive direction is right
         * @param {Number} dy - Offset along Y axis in map coordinates, positive direction is down
         */
        move (dx, dy) {
            if (!sGis.utils.isNumber(dx) || !sGis.utils.isNumber(dy)) sGis.utils.error('Number, Number is expected but got ' + dx + ', ' + dy + ' instead');
            var position = this.position;
            position.x += dx;
            position.y += dy;
            this.position = position;
        }

        /**
         * Changes the scale of map by scalingK
         * @param {Number} scalingK - Coefficient of scaling (Ex. 5 -> 5 times zoom in)
         * @param {sGis.Point} basePoint - /optional/ Base point of zooming
         * @param {Boolean} [doNotAdjust=false] - do not adjust resolution to the round ones
         */
        changeScale (scalingK, basePoint, doNotAdjust) {
            var resolution = this.resolution;
            this.setResolution(resolution * scalingK, basePoint, doNotAdjust);
        }

        /**
         * Changes the scale of map by scalingK with animation
         * @param {float} scalingK - Coefficient of scaling (Ex. 5 -> 5 times zoom in)
         * @param {sGis.Point} basePoint - /optional/ Base point of zooming
         */
        animateChangeScale (scalingK, basePoint) {
            this.animateSetResolution(this.resolution * scalingK, basePoint);
        }

        zoom (k, basePoint) {
            let tileScheme = this.tileScheme;
            let currResolution = this._animationTarget ? this._animationTarget[1] : this.resolution;

            let resolution;
            if (tileScheme) {
                let level = tileScheme.getLevel(currResolution) + (k > 0 ? -1 : 1);
                resolution = tileScheme.levels[level] ? tileScheme.levels[level].resolution : currResolution;
            } else {
                resolution = currResolution * Math.pow(2, -k);
            }

            resolution = Math.min(Math.max(resolution, this.minResolution || 0), this.maxResolution || Number.MAX_VALUE);
            this.animateSetResolution(resolution, basePoint);
        }

        adjustResolution () {
            let resolution = this.resolution;
            let newResolution = this.getAdjustedResolution(resolution);
            let ratio = newResolution / resolution;
            if (ratio > 1.1 || ratio < 0.9) {
                this.animateSetResolution(newResolution);
                return true;
            } else if (ratio > 1.0001 || ratio < 0.9999) {
                this.setResolution(newResolution);
                return false;
            }
        }

        getAdjustedResolution (resolution) {
            if (!this.tileScheme) return resolution;
            return this.tileScheme.getAdjustedResolution(resolution);
        }

        /**
         * Sets new resolution to the map with animation
         * @param {Number} resolution
         * @param {sGis.Point} [basePoint] - Base point of zooming
         * @returns {undefined}
         */
        animateSetResolution (resolution, basePoint) {
            var adjustedResolution = this.getAdjustedResolution(resolution);
            var newPosition = this._getScaledPosition(adjustedResolution, basePoint);
            this._animateTo(newPosition, adjustedResolution);
            this.fire('animationStart');
        }

        _animateTo (position, resolution) {
            this.stopAnimation();

            var originalPosition = this.position;
            var originalResolution = this.resolution;
            var dx = position.x - originalPosition.x;
            var dy = position.y - originalPosition.y;
            var dr = resolution - originalResolution;
            var startTime = Date.now();
            this._animationStopped = false;
            this._animationTarget = [position, resolution];

            var self = this;
            this._animationTimer = setInterval(function() {
                var time = Date.now() - startTime;
                if (time >= self._animationTime || self._animationStopped) {
                    self.setPosition(position, resolution);
                    self.stopAnimation();
                    self.fire('animationEnd');
                } else {
                    var x = self._easeFunction(time, originalPosition.x, dx, self._animationTime);
                    var y = self._easeFunction(time, originalPosition.y, dy, self._animationTime);
                    var r = self._easeFunction(time, originalResolution, dr, self._animationTime);
                    self.setPosition(new sGis.Point([x, y], self.crs), r);
                }
            }, 1000 / 60);
        }

        _getScaledPosition (newResolution, basePoint) {
            var position = this.position;
            basePoint = basePoint ? basePoint.projectTo(this.crs) : position;
            var resolution = this.resolution;
            var scalingK = newResolution / resolution;
            return new sGis.Point([(position.x - basePoint.x) * scalingK + basePoint.x, (position.y - basePoint.y) * scalingK + basePoint.y], position.crs);
        }

        stopAnimation () {
            this._animationStopped = true;
            this._animationTarget = null;
            clearInterval(this._animationTimer);
        }

        _easeFunction (t, b, c, d) {
            return b + c * t / d;
        }

        setPosition (position, resolution) {
            this.prohibitEvent('bboxChange');
            this.position = position;
            if (resolution) this.resolution = resolution;
            this.allowEvent('bboxChange');
            this.fire('bboxChange');
        }

        /**
         * Sets new resolution to the map
         * @param {Number} resolution
         * @param {sGis.Point} [basePoint] - Base point of zooming
         * @param {Boolean} [doNotAdjust=false] - do not adjust resolution to the round ones
         */
        setResolution (resolution, basePoint, doNotAdjust) {
            this.setPosition(this._getScaledPosition(this.resolution, basePoint), doNotAdjust ? resolution : this.getAdjustedResolution(resolution));
        }
    }
    
    utils.extend(Map.prototype, defaults);

    Object.defineProperties(Map.prototype, {
        /**
         * Sets or returns the CRS of the map. If the old crs cannot be projected to the new one, the position and resolution of the map are discharged.
         */
        crs: {
            get: function() {
                return this._crs;
            },
            set: function(crs) {
                if (!(crs instanceof sGis.Crs)) sGis.utils.error('sGis.Crs instance is expected but got ' + crs + ' instead');

                var currentCrs = this._crs;
                this._crs = crs;

                if (currentCrs !== crs && (!currentCrs.to || !crs.to)) {
                    this.setPosition(new sGis.Point([0, 0], crs), 1);
                } else {
                    this.position = this.position.projectTo(crs);
                }
            }
        },

        /**
         * Returns or sets the resolution of the map. Triggers the "bboxChange" event if assigned. Throws an exception if assigned value is invalid.<br>
         * Valid values are any positive numbers;
         */
        resolution: {
            get: function() {
                return this._resolution;
            },

            set: function(resolution) {
                if (!sGis.utils.isNumber(resolution) || resolution <= 0) sGis.utils.error('Positive number is expected but got ' + resolution + ' instead');
                this._resolution = resolution;
                this.fire('bboxChange');
            }
        },

        /**
         * The position of the center of the map. Returns a copy of position object (sGis.Point). Triggers "bboxChange" event if assigned.<br>
         * Accepted values are sGis.Point and sGis.feature.Point instances or [x,y] array. Throws an exception if new position cannot be projected into map crs.
         * If the assigned value, the coordinates are considered to be in map crs.
         */
        position: {
            get: function() {
                return this._position.projectTo(this.crs);
            },

            set: function(position) {
                var point;
                if (position instanceof sGis.feature.Point || (sGis.utils.isArray(position) && position.length === 2 && sGis.utils.isNumber(position[0]) && sGis.utils.isNumber(position[1]))) {
                    var coordinates = position.position || position;
                    point = new sGis.Point([coordinates[0], coordinates[1]], position.crs || this.crs);
                } else if (position instanceof sGis.Point) {
                    point = position;
                } else {
                    sGis.utils.error('sGis.Point or sGis.feature.Point instance is expected but got ' + position + ' instead');
                }

                this._position = point.projectTo(this.crs);
                this.fire('bboxChange');
            }
        },

        /**
         * Sets and returns the tile scheme of the map. If set to null (by default), the tile scheme of the first tile layer in the layer list is used.
         */
        tileScheme: {
            get: function() {
                if (this._tileScheme !== null) {
                    return this._tileScheme;
                } else {
                    var layers = this.getLayers(true);
                    var tileScheme = null;
                    for (var i = 0, len = layers.length; i < len; i++) {
                        if (layers[i] instanceof sGis.TileLayer) {
                            tileScheme = layers[i].tileScheme;
                            break;
                        }
                    }
                    return tileScheme;
                }
            },
            set: function(scheme) {
                this._tileScheme = scheme;
            }
        },

        /**
         * Sets and returns the maxim resolution allowed for the map. If set to null, the tileScheme settings will be used. If no tileScheme is set, no limit will be used.
         */
        maxResolution: {
            get: function() {
                return this._maxResolution || this.tileScheme && this.tileScheme.maxResolution;
            },
            set: function(resolution) {
                if (resolution !== null) {
                    var minResolution = this.minResolution;
                    if (resolution < minResolution) sGis.utils.error('maxResolution cannot be less then minResolution');
                }
                this._maxResolution = resolution;
                if (this.resolution > this.maxResolution) this.resolution = resolution;
            }
        },

        minResolution: {
            get: function() {
                return this._minResolution || this.tileScheme && this.tileScheme.minResolution;
            },
            set: function(resolution) {
                if (resolution !== null) {
                    var maxResolution = this.maxResolution;
                    if (resolution < maxResolution) sGis.utils.error('maxResolution cannot be less then minResolution');
                }
                this._maxResolution = resolution;
                if (this.resolution > this.minResolution) this.resolution = resolution;
            }
        }
    });

    return Map;

    /**
     * A layer is added to the map
     * @event sGis.Map#layerAdd
     * @mixes sGisEvent
     * @type {Object}
     * @property {sGis.Layer} layer - added layer
     */

    /**
     * A layer is removed from the map
     * @event sGis.Map#layerRemove
     * @mixes sGisEvent
     * @type {Object}
     * @property {sGis.Layer} layer - removed layer
     */

    /**
     * Position of one of the layers on the map is changed
     * @event sGis.Map#layerOrderChange
     * @mixes sGisEvent
     * @type {Object}
     * @property {sGis.Layer} layer - the layer that was moved
     */

});
