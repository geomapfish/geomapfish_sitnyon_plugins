/**
 * Copyright (c) 2014 SITN
 * Copyright (c) 2015 SITNyon
 *
 */

/**
 * @requires plugins/Tool.js
 * @include CGXP/plugins/ToolActivateMgr.js
*/

/** api: (define)
 *  module = cgxp.plugins
 *  class = RasterStatistics
 */

/** api: (extends)
 *  plugins/Tool.js
 */
Ext.namespace("sitnyon");

/**
 * Class: sitnyon.RasterStatistics(config)
 * Create statistics regarding a drawn surface
 *
 */

sitnyon.RasterStatistics = Ext.extend(gxp.plugins.Tool, {

     /** api: ptype = sitnyon_rasterstatistics */
    ptype: "sitnyon_rasterstatistics",

    /** api: config[toggleGroup]
    * The group this toggle button is member of.
    */
    toggleGroup: null,

    /** api: config[menuText]
    * ``String``
    * Text to display in the menu layout
    */
    menuText: null,

    /** api: config[rasterServiceUrl]
    * ``String``
    * Url to the raster service
    */
    rasterServiceUrl: null,

    /** api: config[maxAreaLimit]
    * ``Integer``
    * Max limit of surface which can be queried
    */
    maxAreaLimit: 150000,

    /** api: config[minAreaLimit]
    * ``Integer``
    * Min limit of surface which can be queried
    */
    minAreaLimit: 1500,

    /** api: config[layers]
    * ``Array``
    * Array of raster layer names which are used within this plugin
    */
    layers: null,

    /** private: property[resultWindow]
    *
    */
    resultWindow: null,

    /** private: property[firstShow]
    * ``Boolean``
    * Tells whether the window has already been displayed.
    * Useful to get it positionned top left.
    */
    firstShow: false,

    /* i18n */
    tooltip: "Calculer des statistiques",
    title: "Statistiques",
    waitMsgText: "Veuillez patienter...",
    popupTitleErrorText: "Erreur",
    errorMsgText: "Erreur lors de la requête.",
    maxAreaLimitMsgText: "La surface dessinée est supérieure à la limite autorisée de",
    minAreaLimitMsgText: "La surface dessinée est inférieure à la limite autorisée de",
    disclaimer: null,

    /** private: property[popupId]
    *
    */
    popupId: "arealStatsHtml",

    addActions: function() {
        var control = this.createControl();

        this.target.mapPanel.map.addControl(control);

        var action = new GeoExt.Action({
            allowDepress: true,
            enableToggle: true,
            pressed: null,
            iconCls: "sitnyon-icon-rasterstatistics",
            tooltip: this.tooltip,
            toggleGroup: this.toggleGroup,
            group: this.toggleGroup,
            control: control,
            menuText: this.menuText
        });

        return sitnyon.RasterStatistics.superclass.addActions.apply(this, [action]);
    },

    createResultWindow: function() {
        this.resultWindow = new Ext.Window({
            width: 280,
            height: 180,
            title: this.title,
            collapsible: false,
            resizable: true,
            renderTo: Ext.getBody(),
            autoScroll: true,
            padding: "7px 5px",
            closeAction: "hide",
            html: [
                "<div id=\"",
                this.popupId,
                "\"></div>"
            ].join(""),
            scope: this
        });
    },

    renderResult: function(response, feature) {
        var geom = feature.feature.geometry;
        var layerStatistics = [];
        var html = [];

        for (var key in response["layer_statistics"]) {
            if (response["layer_statistics"].hasOwnProperty(key)) {
                layerStatistics.push([key, response["layer_statistics"][key]]);
            }
        };

        layerStatistics.sort(function(a, b) {
            return a[1]["order"] - b[1]["order"];
        });

        for (var i = 0; i < layerStatistics.length; i++) {
            var classification = layerStatistics[i][1];

            for (var key in classification["results"]) {
                html += [
                    "<p>",
                    "&nbsp;-&nbsp;<b>",
                    OpenLayers.Number.format(classification["results"][key], null, "'"),
                    "</b>&nbsp;",
                    OpenLayers.i18n(classification["unit"]),
                    "</p>"
                ].join("");
            }
        }

        if (this.disclaimer) {
            html += [
                "<p>&nbsp;<br />",
                this.disclaimer,
                "</p>"
            ].join("");
        }

        var popup = Ext.get(this.popupId).dom;
        popup.innerHTML = html;
        this.resultWindow.body.unmask();
    },

    resetPopup: function() {
        var popup = Ext.get(this.popupId).dom;
        if (popup) {
            popup.innerHTML = "";
        }
    },

    hideResultWindow: function() {
        if (this.resultWindow.isVisible() === true) {
            this.resultWindow.hide();
        }
    },

    openResultWindow: function(feature) {
        var geom = feature.feature.geometry;
        var area = geom.getArea();

        if (area > this.maxAreaLimit) {
            Ext.Msg.alert(
                this.popupTitleErrorText,
                [
                    this.maxAreaLimitMsgText,
                    "&nbsp;",
                    OpenLayers.Number.format(this.maxAreaLimit, 0, "'"),
                    " m<sup>2</sup>."
                ].join("")
            );
            return;
        }

        else if (area < this.minAreaLimit) {
            Ext.Msg.alert(
                this.popupTitleErrorText,
                [
                    this.minAreaLimitMsgText,
                    "&nbsp;",
                    OpenLayers.Number.format(this.minAreaLimit, 0, "'"),
                    " m<sup>2</sup>."
                ].join("")
            );
            return;
        }

        else {
            if (!this.resultWindow) {
                this.createResultWindow();
            }
            else {
                this.resetPopup();
            }

            if (this.firstShow === false) {
                this.resultWindow.alignTo(
                    this.target.mapPanel.body,
                    "tr-tr",
                    [-5, 5],
                    true
                );
                this.firstShow = true;
            }

            if (this.resultWindow.isVisible() === false) {
                this.resultWindow.show();
            }
            this.resultWindow.body.mask(this.waitMsgText);

            var geojson = new OpenLayers.Format.GeoJSON();

            Ext.Ajax.request({
                url: this.rasterServiceUrl,
                method: "POST",
                params: {
                    feature: geojson.write([feature.feature]),
                    layers: Ext.encode(this.layers)
                },
                success: function(response) {
                    this.renderResult(Ext.decode(response.responseText), feature);
                },
                failure: function() {
                    this.resultWindow.body.unmask();
                    this.resultWindow.hide();
                    Ext.Msg.alert(this.popupTitleErrorText, this.errorMsgText);
                },
                scope: this
            });
        }
    },

    createControl: function() {
        return new sitnyon.RasterStatistics.Control ({
            eventListeners: {
                featureadded: function(feature) {
                    this.openResultWindow(feature);
                },
                deactivate: function() {
                    this.hideResultWindow();
                },
                scope: this
            }
        });
    }
});

Ext.preg(sitnyon.RasterStatistics.prototype.ptype, sitnyon.RasterStatistics);

sitnyon.RasterStatistics.Control = OpenLayers.Class(OpenLayers.Control.DrawFeature, {

    initialize: function(options) {
        var styleDefault = OpenLayers.Util.extend(
            OpenLayers.Feature.Vector.style["default"],
            {
                strokeColor: "blue",
                strokeWidth: 2,
                fillColor: "blue"
            }
        );

        var layer = new OpenLayers.Layer.Vector(
            "rasterstatistics", {
                alwaysInRange: true,
                displayInLayerSwitcher: false,
                styleMap: new OpenLayers.StyleMap({
                    "default": styleDefault
                }),
                eventListeners: {
                    beforefeatureadded: function() {
                        this.removeAllFeatures();
                    }
                }
            }
        );

        OpenLayers.Control.DrawFeature.prototype.initialize.call(
            this,
            layer,
            OpenLayers.Handler.Polygon,
            options
        );
    },

    activate: function() {
        if (OpenLayers.Control.DrawFeature.prototype.activate.call(this)) {
            this.map.addLayer(this.layer);
        }
    },

    deactivate: function() {
        if (OpenLayers.Control.DrawFeature.prototype.deactivate.call(this)) {
            this.layer.destroyFeatures();
            this.map.removeLayer(this.layer);
        }
    },

    CLASS_NAME: "sitnyon.RasterStatistics.Control"
});
