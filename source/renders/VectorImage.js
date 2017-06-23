sGis.module('render.VectorImage', {

}, () => {

    'use strict';

    /**
     * @implements sGis.IRender
     */
    class VectorImage {
        constructor(imageNode, position, properties) {
            this._node = imageNode;
            this._position = position;
            Object.assign(this, properties);
        }

        get node() { return this._node; }

        get isVector() { return true; }

        get origin() { return [this._position[0] + this.offset[0], this._position[1] + this.offset[1]]; }

        contains(position) {
             let [x, y] = this.origin;
             return position[0] >= x && position[0] <= x + this._node.width && position[1] >= y && position[1] <= y + this._node.height;
        }
    }

    Object.assign(VectorImage.prototype, {
        offset: [0, 0]
    });

    return VectorImage;

});