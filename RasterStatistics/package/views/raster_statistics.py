# -*- coding: utf-8 -*-

# Copyright (c) 2013, Camptocamp SA
# All rights reserved.

# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions are met:

# 1. Redistributions of source code must retain the above copyright notice, this
#    list of conditions and the following disclaimer.
# 2. Redistributions in binary form must reproduce the above copyright notice,
#    this list of conditions and the following disclaimer in the documentation
#    and/or other materials provided with the distribution.

# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
# ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
# WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
# DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
# ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
# (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
# LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
# ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
# (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
# SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

# The views and conclusions contained in the software and documentation are those
# of the authors and should not be interpreted as representing official policies,
# either expressed or implied, of the FreeBSD Project.


import math
import geojson

from decimal import Decimal

from pyramid.view import view_config
from pyramid.response import Response
from pyramid.httpexceptions import HTTPNotFound, HTTPInternalServerError

from shapely.geometry import shape, Point

from numpy import median, mean, std, max, min, bincount, hstack
from numpy import sum as nsum

from c2cgeoportal.views.raster import Raster
from c2cgeoportal.models import DBSession

class RasterStatistics(Raster):

    @view_config(route_name='raster_statistics', renderer='decimaljson')

    def json(self):
        """answers to /raster/statistics"""
        layer, results = self._compute_points()
        return {'layer_statistics': results}

    def _compute_points(self):
        """Compute the alt=fct(dist) array"""

        collection = geojson.loads(self.request.params['feature'])
        geom = shape(collection['features'][0]['geometry'])

        continous_functions = {
            'mean': mean,
            'min': min,
            'max': max,
            'median': median,
            'std': std,
            'sum': nsum
        }

        if 'layers' in self.request.params:
            rasters = {}
            layers = geojson.loads(self.request.params['layers'])
            for layer in layers:
                if layer in self.rasters:
                    rasters[layer] = self.rasters[layer]
                else:
                    raise HTTPNotFound("Layer %s not found" % layer)
        else:
            rasters = self.rasters

        classifications = {}

        for ref in rasters.keys():

            results = []
            layer_parameters = self.request.registry.settings['raster_statistics'][ref]
            coords, exception = self._create_points(geom, layer_parameters['resolution'])

            if exception is not None:
                raise HTTPInternalServerError(exception)

            for coord in coords:
                value = self._get_raster_value(
                    self.rasters[ref],
                    ref,
                    coord[0],
                    coord[1]
                )
                if value:
                    results.append(float(value))

            classification = {'results': {}}
            values = layer_parameters['values']

            # Create statistics
            for param in values:
                classification['results'][param] = self._round(
                    continous_functions[param](results),
                    layer_parameters['round']
                )

            classification['unit'] = layer_parameters['unit']
            classification['order'] = layer_parameters['order']

            classifications[ref] = classification

        return rasters.keys(), classifications

    def _create_points(self, polygon, resolution):

        exception = None

        xmin, ymin, xmax, ymax = polygon.bounds
        envelope = polygon.envelope
        target_proportion = polygon.area / envelope.area

        if target_proportion < 0.0001:
            exception = 'Target area proportion of geometry is too low (%)', 100.0 * target_proportion
            return exception

        points = []
        xRange = int((xmax - xmin) / resolution)
        yRange = int((ymax - ymin) / resolution)

        for x in range(0, xRange):
            for y in range(0, yRange):
                x_coord = x * resolution + xmin
                y_coord = y * resolution + ymin
                point = Point(x_coord, y_coord)

                if polygon.contains(point):
                    points.append([x_coord, y_coord])

        return points, exception
