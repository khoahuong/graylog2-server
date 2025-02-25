/*
 * Copyright (C) 2020 Graylog, Inc.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the Server Side Public License, version 1,
 * as published by MongoDB, Inc.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * Server Side Public License for more details.
 *
 * You should have received a copy of the Server Side Public License
 * along with this program. If not, see
 * <http://www.mongodb.com/licensing/server-side-public-license>.
 */
import * as React from 'react';
import { useCallback } from 'react';
import { useFormikContext, FieldArray } from 'formik';

import ElementConfigurationSection from './ElementConfigurationSection';
import Metric from './Metric';

import MetricElement from '../aggregationElements/MetricElement';
import { WidgetConfigFormValues } from '../WidgetConfigForm';

const MetricsConfiguration = () => {
  const { values: { metrics }, values, setValues } = useFormikContext<WidgetConfigFormValues>();
  const removeMetric = useCallback((index) => {
    setValues(MetricElement.removeElementSection(index, values));
  }, [setValues, values]);

  return (
    <FieldArray name="metrics"
                render={() => (
                  <>
                    <div>
                      {metrics.map((metric, index) => {
                        return (
                        // eslint-disable-next-line react/no-array-index-key
                          <ElementConfigurationSection key={`metrics-${index}`} onRemove={() => removeMetric(index)}>
                            <Metric index={index} />
                          </ElementConfigurationSection>
                        );
                      })}
                    </div>
                  </>
                )} />
  );
};

export default MetricsConfiguration;
