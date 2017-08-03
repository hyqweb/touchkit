import MT from '@meitu/mtouch';
import MC from '@meitu/mcanvas';
import ZIndex from './zIndex';
import _ from './utils';

const EVENT = ['touchstart','touchmove','touchend','drag','dragstart','dragend','pinch','pinchstart','pinchend','rotate','rotatestart','rotatend','singlePinchstart','singlePinch','singlePinchend','singleRotate','singleRotatestart','singleRotatend'];

window.requestAnimFrame = (function() {
    return window.requestAnimationFrame || window.webkitRequestAnimationFrame || function(callback) {
        window.setTimeout(callback, 1000 / 60);
    };
})();

export default function Touchkit(ops) {
    // 兼容不使用 new 的方式；
    if (!(this instanceof Touchkit))
        return new Touchkit(ops);

    this._ops = {
        el: null,
        // event
        event:{
            touchstart() {},touchmove() {},touchend() {},
            dragstart() {},drag(){},dragend() {},
            pinchstart() {},pinch(){},pinchend() {},
            rotatestart() {},rotate(){},rotatend() {},
            singlePinchstart(){},singlePinch(){},singlePinchend(){},
            singleRotatestart(){},singleRotate(){},singleRotatend(){},
        },
    };

    if(typeof ops == 'object'){
        this._ops = _.extend(this._ops, ops);
    }else if(typeof ops == 'string'){
        this._ops.el = ops;
    }

    // 手势容器；
    this.el = _.getEl(this._ops.el);
    // 容器宽高，优先使用clientWidth，避免边框等因素的影响；
    this.elStatus = {
        width:this.el.clientWidth || this.el.offsetWidth,
        height:this.el.clientHeight || this.el.offsetHeight,
    };
    this._init();

    // 初始化mtouch；
    this.mt = MT(this.el);

    this._bind();

    this._insertCss();

}

Touchkit.prototype._init = function(){
    // 操作元素
    this.operator = null;
    this.operatorStatus = null;

    this.transform = null;
    this.freezed = false;
    // 子元素仓库，index用于标记子元素；
    this._childs = {};
    this._childIndex = 0;
    this._activeChild = null;
    // 管理子元素之间的zindex层级关系；
    this._zIndexBox = new ZIndex();
};

Touchkit.prototype.background = function(ops){
    let _ops = {
        // 背景图片，type: url/HTMLImageElement/HTMLCanvasElement
        image:'' ,
        // 绘制方式: crop / contain
            // crop : 裁剪模式，背景图自适应铺满画布，多余部分裁剪；
            // contain : 包含模式, 类似于 background-size:contain; 可通过left/top值进行位置的控制；
        type:'contain',
        // 背景图片距离画布左上角的距离，
        left:0,
        top:0,
        // 在type=crop时使用，背景图只需启动拖动操作；
        use:{
            drag:true,
        },
    };
    _ops = _.extend(_ops,ops);
    _.getImage(_ops.image, img => {
        // 背景图真实宽高及宽高比；
        let iw = img.naturalWidth,
            ih = img.naturalHeight,
            iratio = iw / ih;
        // 容器宽高及宽高比；
        let pw = this.elStatus.width,
            ph = this.elStatus.height,
            pratio = pw / ph;

        let left,top,width,height;
        let minX = 0 , minY = 0;
        let ratio;

        // 初始化背景图属性；
        _.addClass(img,'mt-background').data(img,'mt-index','background').data(img,'mt-bg-type', _ops.type);

        if(_ops.type == 'contain'){
            if(iratio > pratio){
                left = _ops.left || 0;
                top = _ops.top || (ph - pw/iratio) / 2;
                width = pw;
                height = pw / iratio;
                ratio = iw / width;
            }else{
                left = _ops.left || (pw - ph*iratio) / 2;
                top = _ops.top || 0;
                width = ph*iratio;
                height = ph;
                ratio = ih / height;
            }
        }else if(_ops.type == 'crop'){
            left = 0;
            top = 0;
            if(iratio > pratio){
                width = ph*iratio;
                height = ph;
                minX = (width - pw)/width;
                ratio = ih / height;
            }else{
                width = pw;
                height = pw/iratio;
                minY = (height - ph)/height;
                ratio = iw / width;
            }
            _ops.limit = {
                x:minX,
                y:minY,
                maxScale:1,
                minScale:1,
            };
        }
        img.style = `width:${width}px;height:${height}px;left:${left}px;top:${top}px`;
        this.el.appendChild(img);

        // 记录背景图参数；
        _ops.ratio = ratio;
        _ops.left = left;
        _ops.top = top;

        this._childs.background = {
            el:img,
            ops: _ops,
        };
    });
    return this;
};

Touchkit.prototype.add = function(ops){
    let _ops = {
        image:'',
        width:'',
        use:{
            drag:false,
            pinch:false,
            rotate:false,
            singlePinch:false,
            singleRotate:false,
        },
        limit:false,
        pos:{
            x:0,
            y:0,
            scale:1,
            rotate:0,
        },
        close:false,
    };
    _ops = _.extend(_ops,ops);
    _.getImage(_ops.image,img => {
        let iw = img.naturalWidth,
            ih = img.naturalHeight,
            iratio = iw / ih;
        let _templateEl = img;
        let _ele = _.domify(`<div class="mt-child" id="mt-child-${this._childIndex}" data-mt-index="${this._childIndex}"></div>`)[0];
        let originWidth = this._get('hor',_ops.width),
            originHeight = originWidth / iratio;
        let spaceX = (_ops.pos.scale - 1) * originWidth/2,
            spaceY = (_ops.pos.scale - 1) * originHeight/2;
        _ele.style = `width:${originWidth}px;height:${originHeight}px`;
        _.addClass(_templateEl,'mt-image');
        _ele.appendChild(_templateEl);
        // 是否添加关闭按钮；
        if(_ops.close){
            _ele.appendChild(_.domify(`<div class="mt-close-btn"></div>`)[0]);
        }
        this.el.appendChild(_ele);
        // 记录数据；
        this._childs[this._childIndex] = {
            el:_ele,
            ops: _ops,
        };
        // 根据id进行zIndex的设置；
        this._zIndexBox.setIndex(`mt-child-${this._childIndex}`);

        // 没有开启单指操作时，不添加单指按钮；
        let addButton = (_ops.use.singlePinch || _ops.use.singleRotate) ? true : false;
        // 切换operator到新添加的元素上；
        this.switch(_ele,addButton);

        // space 为因为缩放造成的偏移误差；
        this._setTransform(_ele,{
            x:this._get('hor',_ops.pos.x) + spaceX,
            y:this._get('ver',_ops.pos.y) + spaceY,
            scale:_ops.pos.scale,
            rotate:_ops.pos.rotate,
        });
        this._childIndex++;
    });
    return this;
};
// 使用 mcanvas 合成图片后导出 base64;
Touchkit.prototype.exportImage = function(cbk){
    let cwidth = this.elStatus.width,
        cheight = this.elStatus.height;
    let bg = this._childs.background;
    let bgLeft,bgTop;
    let ratio = bg.ops.ratio;
    let mc = new MC(cwidth*ratio,cheight*ratio);
    let addChilds = [];
    this._zIndexBox.zIndexArr.forEach(v=>{
        let child = document.querySelector('#'+v);
        let image = child.querySelector('.mt-image');
        let childPos = JSON.parse(_.data(child,'mtouch-status'));
        let width = image.clientWidth || image.offsetWidth;
        childPos.x *= ratio;
        childPos.y *= ratio;
        addChilds.push({
            image:image,
            options:{
                width: width * ratio,
                pos:childPos,
            },
        });
    });
    if(bg.ops.type == 'crop'){
        let bgPos = JSON.parse(_.data(bg.el,'mtouch-status')) || {left:0,top:0,scale:1,rotate:0};
        bgLeft = -bgPos.x;
        bgTop = -bgPos.y;
    }else{
        bgLeft = bg.ops.left;
        bgTop = bg.ops.top;
    }
    mc.background({
        image:bg.el,
        type:bg.ops.type,
        left:bgLeft * ratio,
        top:bgTop * ratio,
    }).add(addChilds).draw(b64=>{
        cbk(b64);
    });
};

Touchkit.prototype._bind = function(){
    // 绑定所有事件；
    EVENT.forEach(evName=>{
        if(!this[evName]){
            this[evName] = () =>{
                this._ops.event[evName]();
            };
        }
        this.mt.on(evName,this[evName].bind(this));
    });

    // 点击子元素外的区域失去焦点；
    this.el.addEventListener('click',ev=>{
        if(!this._isAdd(ev.target)){
            this.switch(null);
        }
        // 如果背景为裁剪模式，则切换到操作背景图；
        if(_.hasClass(ev.target,'mt-background') && _.data(ev.target,'mt-bg-type') == 'crop'){
            this.switch(ev.target);
        }

    });

    // 切换子元素；
    _.delegate(this.el,'click','.mt-child',ev=>{
        let el = ev.delegateTarget,
            _ops = this._getOperatorOps(el),
            _addButton = (_ops.use.singlePinch || _ops.use.singleRotate) ? true : false;
        this.switch(el,_addButton);
        this._zIndexBox.toTop(el.id);
    });

    // 关闭按钮事件；
    _.delegate(this.el,'click','.mt-close-btn',ev=>{
        let _el = ev.delegateTarget;
        let _child = _el.parentNode || _el.parentElement;
        this._zIndexBox.removeIndex(_child.id);
        _.remove(_child);
    });
};

Touchkit.prototype.touchstart = function(ev){
    if(!this.freezed){
        if(this.operator){
            this.transform = _.getPos(this.operator);
        }
        this._ops.event.touchstart(ev);
    }
};

Touchkit.prototype.drag = function(ev){
    if(!this.freezed){
        if(this.operator){
            let ops = this._getOperatorOps();
            if(ops.use.drag){
                this.transform.x += ev.delta.deltaX;
                this.transform.y += ev.delta.deltaY;
                this._setTransform();
            }
        }
        this._ops.event.drag(ev);
    }
};

Touchkit.prototype.pinch = function(ev){
    if(!this.freezed){
        if(this.operator){
            let ops = this._getOperatorOps();
            if(ops.use.pinch){
                this.transform.scale *= ev.delta.scale;
                this._setTransform();
            }
        }
        this._ops.event.pinch(ev);
    }
};
Touchkit.prototype.rotate = function(ev){
    if(!this.freezed){
        if(this.operator){
            let ops = this._getOperatorOps();
            if(ops.use.rotate){
                this.transform.rotate += ev.delta.rotate;
                this._setTransform();
            }
        }
        this._ops.event.rotate(ev);
    }
};
Touchkit.prototype.singlePinch = function(ev){
    if(!this.freezed){
        if(this.operator){
            let ops = this._getOperatorOps();
            if(ops.use.singlePinch){
                this.transform.scale *= ev.delta.scale;
                this._setTransform();
            }
        }
        this._ops.event.singlePinch(ev);
    }
};
Touchkit.prototype.singleRotate = function(ev){
    if(!this.freezed){
        if(this.operator){
            let ops = this._getOperatorOps();
            if(ops.use.singleRotate){
                this.transform.rotate += ev.delta.rotate;
                this._setTransform();
            }
        }
        this._ops.event.singleRotate(ev);
    }
};
Touchkit.prototype._setTransform = function(el = this.operator, transform = this.transform) {
    let trans = JSON.parse(JSON.stringify(transform));
    let ops = this._getOperatorOps();
    let defaulLimit = {
        x:0.5,
        y:0.5,
        maxScale:3,
        minScale:0.4,
    };
    let _limit = (ops.limit && ops.limit !== true) ? _.extend(defaulLimit,ops.limit) : defaulLimit;
    if(ops.limit){
        trans = this._limitOperator(trans,_limit);
    }
    // 当 isHold 参数开启时，反向设置按钮的scale值，使按钮大小保持不变；
    if(ops.use.singlePinch){
        let singlePinchBtn = el.querySelector(`.mtouch-singleButton`);
            singlePinchBtn.style.transform = `scale(${1/trans.scale})`;
            singlePinchBtn.style.webkitTransform = `scale(${1/trans.scale})`;
    }
    if(ops.use.singleRotate){
        let singleRotateBtn = el.querySelector(`.mtouch-singleButton`);
            singleRotateBtn.style.transform = `scale(${1/trans.scale})`;
            singleRotateBtn.style.webkitTransform = `scale(${1/trans.scale})`;
    }
    if(ops.close){
        let closeBtn = el.querySelector(`.mt-close-btn`);
        closeBtn.style.transform = `scale(${1/trans.scale})`;
        closeBtn.style.webkitTransform = `scale(${1/trans.scale})`;
    }
    window.requestAnimFrame(()=>{
        _.setPos(el, trans);
    });
};
Touchkit.prototype._limitOperator = function(transform,limit) {
    // 实时获取操作元素的状态；
    let {minScale, maxScale} = limit;
    if (minScale && transform.scale < minScale){
        transform.scale = minScale;
    }
    if (maxScale && transform.scale > maxScale){
        transform.scale = maxScale;
    }
    let operatorStatus = _.getOffset(this.operator);
    // 因缩放产生的间隔；
    let spaceX = operatorStatus.width * (transform.scale - 1) / 2;
    let spaceY = operatorStatus.height * (transform.scale - 1) / 2;
    // 参数设置的边界值；
    let boundaryX = operatorStatus.width * transform.scale  * (limit.x);
    let boundaryY = operatorStatus.height * transform.scale * (limit.y);
    // 4个边界状态；
    let minX = spaceX - boundaryX;
    let minY = spaceX - boundaryY;
    let maxX = this.elStatus.width - operatorStatus.width * transform.scale + spaceX + boundaryX;
    let maxY = this.elStatus.height - operatorStatus.height * transform.scale + spaceY + boundaryY;

    if(limit.x || limit.x == 0){
        if(transform.x >= maxX)transform.x = maxX;
        if(transform.x < minX)transform.x = minX;
    }
    if(limit.y || limit.y == 0){
        if(transform.y > maxY)transform.y = maxY;
        if(transform.y < minY)transform.y = minY;
    }
    return transform;
};
Touchkit.prototype.switch = function(el,addButton){
    if(!this.mt || this.freezed)return;
    if(el){
        el = _.getEl(el);
    }
    _.forin(this._childs,(k,v)=>{
        _.removeClass(v.el,'mt-active');
    });
    // 转换操作元素后，也需要重置 mtouch 中的单指缩放基本点 singleBasePoint;
    this.mt.switch(el,addButton);
    // 切换operator;
    this.operator = el;

    if(el){
        _.addClass(el,'mt-active');
        this._activeChild = el;
    }
    return this;
};

Touchkit.prototype._getOperatorOps = function(target){
    let _tar = target || this.operator;
    let index = _.data(_tar,'mt-index');
    return this._childs[index].ops;
};

// 冻结手势容器，暂停所有操作，且失去焦点；
// 解冻后恢复最后状态；
Touchkit.prototype.freeze = function(boolean){
    if(boolean){
        _.forin(this._childs,(k,v)=>{
            _.removeClass(v.el,'mt-active');
        });
    }else{
        _.addClass(this._activeChild,'mt-active');
    }
    this.freezed = boolean ? true:false;
    return this;
};

// 重置所有状态到初始化阶段；
Touchkit.prototype.reset = function(){
    _.forin(this._childs,(k,v)=>{
        _.remove(v.el);
    });
    this._init();
};

// 销毁，但保持原有样式，失去焦点与事件绑定；
Touchkit.prototype.destory = function(){
    _.forin(this._childs,(k,v)=>{
        _.removeClass(v.el,'mt-active');
    });
    this.mt && this.mt.destroy();
    this.mt = null;
};
// 参数加工函数；
// 兼容 5 种 value 值：
// x:250, x:'250px', x:'100%', x:'left:250',x:'center',
// width:100,width:'100px',width:'100%'
Touchkit.prototype._get = function(drection,str){
    let result = str;
    let k,par,child;
    if(document.body && document.body.clientWidth){
        k = drection == 'hor' ? 'clientWidth':'clientHeight';
    }else{
        k = drection == 'hor' ? 'offsetWidth' : 'offsetHeight';
    }
    par = this.el[k];
    child = this.operator ? this.operator[k] : 0;
    if(typeof str === 'string'){
        if(_.include(str,':')){
            let arr = str.split(':');
            switch (arr[0]) {
                case 'left':
                case 'top':
                    result = +(arr[1].replace('px',''));
                    break;
                case 'right':
                case 'bottom':
                    result = par - (+(arr[1].replace('px',''))) - child;
                    break;
                default:
            }
        }else if (_.include(str,'px')) {
            result = (+str.replace('px', ''));
        } else if (_.include(str,'%')) {
            result = par * (+str.replace('%', '')) / 100;
        }else if(str == 'center'){
            result = (par-child)/2;
        }else{
            result = +str;
        }
    }
    return result;
};

Touchkit.prototype._isAdd = function(el){
    let target = el;
    while(target !== this.el || target.tagName.toLowerCase() == 'body'){
        if(_.include(target.className,'mt-child')){
            return true;
        }
        target = target.parentNode;
    }
    return false;
};

Touchkit.prototype._insertCss = function(){
    _.addCssRule('.mtouch-singleButton','display: none;');
    _.addCssRule('.mt-child.mt-active','z-index: 99;outline:2px solid hsla(0,0%,100%,.5);');
    _.addCssRule('.mt-active .mtouch-singleButton,.mt-active .mt-close-btn','display: inline-block;');
    _.addCssRule('.mt-child','position:absolute;text-align:left;');
    _.addCssRule('.mt-image','width:100%;height:100%;position:absolute;text-align:left;');
    _.addCssRule('.mt-close-btn','position:absolute;width:30px;height:30px;top:-15px;right:-15px;background-size:100%;display:none;');
    _.addCssRule('.mt-background','position:absolute;left:0;top:0;');
};
