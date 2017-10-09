import {Feature, IFeatureConstructorArgs} from "./Feature";
import {IPoint, Point} from "../Point";
import {Coordinates} from "../baseTypes";
import {Bbox} from "../Bbox";
import {Crs} from "../Crs";
import {PointSymbol} from "../symbols/point/Point";
import {Symbol} from "../symbols/Symbol";

/**
 * Simple geographical point.
 * @alias sGis.feature.Point
 */
export class PointFeature extends Feature implements IPoint {
    private _position: Coordinates;
    protected _symbol: Symbol;

    /**
     * @param {Position} position - coordinates of the point
     * @param {Object} properties - key-value set of properties to be set to the instance
     */
    constructor(position: Coordinates, { symbol = new PointSymbol(), crs }: IFeatureConstructorArgs = {}) {
        super({ symbol, crs });
        this._position = position;
    }

    projectTo(crs: Crs): PointFeature {
        let projected = Point.prototype.projectTo.call(this, crs);
        return new PointFeature(projected.position, { crs: crs, symbol: this.symbol });
    }

    /**
     * Returns a copy of the point. The copy will include all sGis.Point properties, but will not copy of user defined properties or event listeners.
     */
    clone(): PointFeature {
        return this.projectTo(this.crs);
    }

    get bbox(): Bbox { return new Bbox(this._position, this._position, this.crs); }

    get position(): Coordinates { return [this._position[0], this._position[1]]; }
    set position(position: Coordinates) {
        this._position = position;
        this.redraw();
    }

    get point(): Point { return new Point(this.position, this.crs); }
    set point(point: Point) { this.position = point.projectTo(this.crs).position; }

    get x(): number { return this._position[0]; }
    set x(x: number) {
        this._position[0] = x;
        this.redraw();
    }

    get y(): number { return this._position[1]; }
    set y(y: number) {
        this._position[1] = y;
        this.redraw();
    }

    get coordinates(): Coordinates { return [this.position[0], this.position[1]]; }
    set coordinates(position: Coordinates) { this.position = [position[0], position[1]]; }
}
