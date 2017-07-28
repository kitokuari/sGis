sGis.module('Crs', [

], function() {
    'use strict';

    let identityProjection = ([x,y]) => [x,y];

    /**
     * @class
     * @alias sGis.Crs
     * @property {Object} description - description of the crs
     */
    class Crs {
        /**
         * @constructor
         * @param {Object} [description] - description of the crs
         * @param {Map} [projectionsMap]
         */
        constructor(description = {}, projectionsMap = new Map()) {
            let { wkid, authority, wkt, details } = description;

            this.wkid = wkid;
            this.authority = authority;
            this.wkt = wkt;
            this.details = details;

            this._projections = projectionsMap;
        }

        toString() {
            if (this.wkid) return this.wkid.toString();
            if (this.wkt) return this.wkt;

            return this.details;
        }

        /**
         * Returns true if given crs represents the same spatial reference system
         * @param {sGis.Crs} crs
         * @returns {boolean}
         */
        equals(crs) {
            if (this === crs) return true;
            if (this.wkid && this.wkid === crs.wkid) return true;

            return this.wkt && this.wkt === crs.wkt;
        }

        /**
         * Returns projection function from the current coordinate system to specified. Returned function takes one [x,y] parameter and returns projected [x,y] (corresponding to crs parameter)
         * @param {sGis.Crs} crs
         * @returns {Function|null}
         */
        projectionTo(crs) {
            if (this._projections.get(crs)) return this._projections.get(crs);
            return this._discoverProjectionTo(crs);
        }

        /**
         * Returns true if the current coordinate system can be projected to the given crs
         * @param {sGis.CRS} crs
         * @returns {boolean}
         */
        canProjectTo(crs) {
            return this.projectionTo(crs) !== null;
        }

        /**
         * Adds the projection function to the coordinate system
         * @param {sGis.Crs} crs
         * @param {Function} func
         */
        setProjectionTo(crs, func) {
            this._projections.set(crs, func);
        }

        _discoverProjectionTo(crs) {
            if (this._discoveryMode) return null;
            if (this.equals(crs)) return identityProjection;

            this._discoveryMode = true;
            for (let [ownCrs, func] of this._projections) {
                if (ownCrs.equals(crs)) {
                    this._projections.set(crs, func);
                    break;
                }

                let innerProjection = ownCrs._discoverProjectionTo(crs);
                if (innerProjection) {
                    let result = function([x, y]) { return innerProjection(func([x, y])); };
                    this._projections.set(crs, result);
                    break;
                }
            }
            this._discoveryMode = false;

            return this._projections.get(crs) || null;
        }

        /**
         * String description of the crs.
         * @type string
         */
        get stringDescription() {
            return JSON.stringify(this.description);
        }

        /**
         * @deprecated
         */
        getWkidString() {
            return this.description;
        }
    }

    return Crs;

});


sGis.module('CRS', [
    'Crs',
    'math'
], function(Crs, math) {

    /**
     * @namespace
     * @alias sGis.CRS
     */
    let CRS = {};

    /**
     * Plain euclidean coordinate system. This projection cannot be projected to any other projection.
     * @type sGis.Crs
     * @alias sGis.CRS.plain
     * @memberof sGis.CRS
     */
    CRS.plain = new Crs('Plain crs without any projection functions');

    /**
     * Geographical coordinate system, which has longitude set as X coordinate, and latitude as Y coordinate.
     * @type sGis.Crs
     * @alias sGis.CRS.wgs84
     * @memberof sGis.CRS
     */
    CRS.wgs84 = new Crs({
        wkid: 84,
        authority: 'OCG',
        wkt: 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]'
    });

    /**
     * @type sGis.Crs
     * @alias sGis.CRS.geo
     * @memberof sGis.CRS
     */
    CRS.geo = new Crs({
        wkid: 4326,
        authority: 'EPSG'
    });

    CRS.geo.setProjectionTo(CRS.wgs84, ([x,y]) => [y,x]);

    /**
     * @deprecated
     */
    CRS.geo.from = (x,y) => { return {x: x, y: y}};
    /**
     * @deprecated
     */
    CRS.geo.to = (x,y) => { return {x: x, y: y}};

    CRS.wgs84.setProjectionTo(CRS.geo, ([x,y]) => [y,x]);

    {
        let a = 6378137;

        /**
         * @type sGis.Crs
         * @alias sGis.CRS.webMercator
         * @memberof sGis.CRS

         */
        CRS.webMercator = new Crs({
            wkid: 3857,
            authority: 'EPSG',
            wkt: 'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]],PROJECTION["Mercator"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["Meter",1]]'
        });

        CRS.webMercator.setProjectionTo(CRS.wgs84, ([x,y]) => {
            let rLat = Math.PI / 2 - 2 * Math.atan(Math.exp(-y / a));
            let rLong = x / a;
            let lon = math.radToDeg(rLong);
            let lat = math.radToDeg(rLat);

            return [lon, lat];
        });
        CRS.wgs84.setProjectionTo(CRS.webMercator, ([x,y]) => {
            let rLon = math.degToRad(x);
            let rLat = math.degToRad(y);
            let X = a * rLon;
            let Y = a * Math.log(Math.tan(Math.PI / 4 + rLat / 2));

            return [X, Y];
        });

        /**
         * @deprecated
         */
        CRS.webMercator.from = (x,y) => {
            let [lat, lon] = CRS.webMercator.projectionTo(CRS.geo)([x,y]);
            return {x: lon, y: lat, lon: lon, lat: lat};
        };
        /**
         * @deprecated
         */
        CRS.webMercator.to = (lon,lat) => {
            let [x, y] = CRS.geo.projectionTo(CRS.webMercator)([lat,lon]);
            return {x: x, y: y};
        }
    }

    {
        let a = 6378137;
        let b = 6356752.3142451793;
        let e =  Math.sqrt(1 - b*b/a/a);
        let eh = e/2;
        let pih = Math.PI/2;

        /**
         * @type sGis.Crs
         * @alias sGis.CRS.ellipticalMercator
         * @memberof sGis.CRS
         */
        CRS.ellipticalMercator = new Crs({
            wkid: 3395,
            authority: 'EPSG',
            wkt: 'PROJCS["WGS 84 / World Mercator",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]],PROJECTION["Mercator"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["Meter",1]]'
        });

        CRS.ellipticalMercator.setProjectionTo(CRS.wgs84, ([x,y]) => {
            let ts = Math.exp(-y/a);
            let phi = pih - 2 * Math.atan(ts);
            let i = 0;
            let dphi = 1;

            while (Math.abs(dphi) > 0.000000001 && i++ < 15) {
                let con = e * Math.sin(phi);
                dphi = pih - 2 * Math.atan(ts * Math.pow((1 - con) / (1 + con), eh)) - phi;
                phi += dphi;
            }

            let rLong = x / a,
                rLat = phi,
                lon = math.radToDeg(rLong),
                lat = math.radToDeg(rLat);

            return [lon, lat];
        });
        CRS.wgs84.setProjectionTo(CRS.ellipticalMercator, ([x,y]) => {
            let rLat = math.degToRad(y);
            let rLon = math.degToRad(x);
            let X = a * rLon;
            let Y = a * Math.log(Math.tan(Math.PI / 4 + rLat / 2) * Math.pow((1 - e * Math.sin(rLat)) / (1 + e * Math.sin(rLat)), (e/2)));

            return [X, Y];
        });

        /**
         * @deprecated
         */
        CRS.ellipticalMercator.from = (x,y) => {
            let [lat, lon] = CRS.ellipticalMercator.projectionTo(CRS.geo)([x,y]);
            return {x: lon, y: lat, lon: lon, lat: lat};
        };
        /**
         * @deprecated
         */
        CRS.ellipticalMercator.to = (lat,lon) => {
            let [x, y] = CRS.geo.projectionTo(CRS.ellipticalMercator)([lat,lon]);
            return {x: x, y: y};
        }
    }

    //noinspection SpellCheckingInspection
    CRS.moscowBessel = new Crs({
        wkt: "PROJCS[\"Moscow_bessel\",GEOGCS[\"GCS_Bessel_1841\",DATUM[\"D_Bessel_1841\",SPHEROID[\"Bessel_1841\",6377397.155,299.1528128]],PRIMEM[\"Greenwich\",0.0],UNIT[\"Degree\",0.0174532925199433]],PROJECTION[\"Transverse_Mercator\"],PARAMETER[\"False_Easting\",0.0],PARAMETER[\"False_Northing\",0.0],PARAMETER[\"Central_Meridian\",37.5],PARAMETER[\"Scale_Factor\",1.0],PARAMETER[\"Latitude_Of_Origin\",55.66666666666666],UNIT[\"Meter\",1.0]]"
    });

    {
        //http://mathworld.wolfram.com/AlbersEqual-AreaConicProjection.html

        let R = 6372795;
        /**
         * Class constructor of Alber's equal area projections.
         * @alias sGis.CRS.AlbersEqualArea
         * @extends Crs
         */
        class AlbersEqualArea extends Crs {
            /**
             * @param {Number} lat0 - latitude of origin
             * @param {Number} lon0 - longitude of origin
             * @param {Number} stLat1 - first standard parallel
             * @param {Number} stLat2 - second standard parallel
             */
            constructor(lat0, lon0, stLat1, stLat2) {
                super({
                    details: 'Albers Equal-Area Conic Projection: ' + lat0 + ',' + lon0 + ',' + stLat1 + ',' + stLat2
                });

                let _lat0 = math.degToRad(lat0);
                let _lon0 = math.degToRad(lon0);
                let _stLat1 = math.degToRad(stLat1);
                let _stLat2 = math.degToRad(stLat2);
                let _n = (Math.sin(_stLat1) + Math.sin(_stLat2)) / 2;
                let _c = Math.pow(Math.cos(_stLat1), 2) + 2 * _n * Math.sin(_stLat1);
                let _ro0 = Math.sqrt(_c - 2 * _n * Math.sin(_lat0)) / _n;

                this.setProjectionTo(CRS.wgs84, ([x,y]) => {
                    let xRad = x / R;
                    let yRad = y / R;
                    let th = Math.atan(xRad / (_ro0 - yRad));
                    let ro = xRad / Math.sin(th);
                    let rLat = Math.asin((_c - ro * ro * _n * _n) / 2 / _n);
                    let rLon = _lon0 + th / _n;

                    let lat = math.radToDeg(rLat);
                    let lon = math.radToDeg(rLon);

                    return [lon, lat];
                });

                CRS.wgs84.setProjectionTo(this, ([lon,lat]) => {
                    let rLon = math.degToRad(lon),
                        rLat = math.degToRad(lat),
                        th = _n * (rLat - _lon0),
                        ro = Math.sqrt(_c - 2 * _n * Math.sin(rLon)) / _n,
                        x = ro * Math.sin(th) * R,
                        y = _ro0 - ro * Math.cos(th) * R;

                    return [x, y];
                });
            }
        }

        /**
         * @deprecated
         */
        AlbersEqualArea.prototype.from = function(x, y) {
            let [lat, lon] = this.projectionTo(CRS.geo)([x,y]);
            return {x: lon, y: lat, lon: lon, lat: lat};
        };
        /**
         * @deprecated
         */        AlbersEqualArea.prototype.to = function(lat, lon)  {
            let [x, y] = CRS.geo.projectionTo(this)([lat,lon]);
            return {x: x, y: y};
        };

        CRS.AlbersEqualArea = AlbersEqualArea;
    }

    /**
     * @type sGis.Crs
     * @alias sGis.CRS.cylindricalEqualArea
     * @memberof sGis.CRS
     */
    CRS.cylindricalEqualArea = new CRS.AlbersEqualArea(0, 180, 60, 50);

    return CRS;

});
