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
import FetchError from 'logic/errors/FetchError';
import ErrorsActions from 'actions/errors/ErrorsActions';
import StoreProvider from 'injection/StoreProvider';
import ActionsProvider from 'injection/ActionsProvider';
// eslint-disable-next-line import/no-cycle
import { createFromFetchError } from 'logic/errors/ReportedErrors';
import Routes from 'routing/Routes';
import history from 'util/History';

const reportServerSuccess = () => {
  const ServerAvailabilityActions = ActionsProvider.getActions('ServerAvailability');

  ServerAvailabilityActions.reportSuccess();
};

const defaultOnUnauthorizedError = (error) => ErrorsActions.report(createFromFetchError(error));

const onServerError = (error, onUnauthorized = defaultOnUnauthorizedError) => {
  const SessionStore = StoreProvider.getStore('Session');
  const fetchError = new FetchError(error.statusText, error);

  if (SessionStore.isLoggedIn() && error.status === 401) {
    const SessionActions = ActionsProvider.getActions('Session');

    SessionActions.logout(SessionStore.getSessionId());
  }

  // Redirect to the start page if a user is logged in but not allowed to access a certain HTTP API.
  if (SessionStore.isLoggedIn() && error.status === 403) {
    onUnauthorized(fetchError);
  }

  if (error.originalError && !error.originalError.status) {
    const ServerAvailabilityActions = ActionsProvider.getActions('ServerAvailability');

    ServerAvailabilityActions.reportError(fetchError);
  }

  throw fetchError;
};

const maybeStringify = (body: any) => (body && typeof body !== 'string' ? JSON.stringify(body) : body);

export class Builder {
  private options = {};

  private readonly url: string;

  private readonly method: string;

  private body: { body: any, mimeType: string };

  private accept: string;

  private responseHandler: (response: any) => any;

  private errorHandler: (error: any) => any;

  constructor(method, url) {
    this.method = method;
    this.url = url.replace(/([^:])\/\//, '$1/');

    this.options = {
      'X-Requested-With': 'XMLHttpRequest',
      'X-Requested-By': 'XMLHttpRequest',
    };

    this.responseHandler = (response) => response;
    this.errorHandler = undefined;
  }

  authenticated() {
    const SessionStore = StoreProvider.getStore('Session');
    const token = SessionStore.getSessionId();

    return this.session(token);
  }

  session(sessionId) {
    const buffer = Buffer.from(`${sessionId}:session`);

    this.options = {
      ...this.options,
      Authorization: `Basic ${buffer.toString('base64')}`,
    };

    return this;
  }

  setHeader(header, value) {
    this.options = {
      ...this.options,
      [header]: value,
    };

    return this;
  }

  json(body) {
    this.body = { body: maybeStringify(body), mimeType: 'application/json' };
    this.accept = 'application/json';

    this.responseHandler = (resp: Response) => {
      if (resp.ok) {
        reportServerSuccess();

        return resp.json();
      }

      throw new FetchError(resp.statusText, resp);
    };

    this.errorHandler = (error) => onServerError(error);

    return this;
  }

  file(body, mimeType) {
    this.body = { body: maybeStringify(body), mimeType: 'application/json' };
    this.accept = mimeType;

    this.responseHandler = (resp) => {
      if (resp.ok) {
        reportServerSuccess();

        return resp.text();
      }

      throw new FetchError(resp.statusText, resp);
    };

    this.errorHandler = (error) => onServerError(error);

    return this;
  }

  plaintext(body) {
    const onUnauthorized = () => history.replace(Routes.STARTPAGE);

    this.body = { body, mimeType: 'text/plain' };
    this.accept = 'application/json';

    this.responseHandler = (resp) => {
      if (resp.ok) {
        reportServerSuccess();

        return resp.json();
      }

      throw new FetchError(resp.statusText, resp);
    };

    this.errorHandler = (error) => onServerError(error, onUnauthorized);

    return this;
  }

  noSessionExtension() {
    this.options = {
      ...this.options,
      'X-Graylog-No-Session-Extension': 'true',
    };

    return this;
  }

  build() {
    const headers = this.body
      ? { ...this.options, 'Content-Type': this.body.mimeType }
      : this.options;

    return window.fetch(this.url, {
      method: this.method,
      headers,
      body: this.body ? this.body.body : undefined,
    }).then(this.responseHandler, this.errorHandler);
  }
}

function queuePromiseIfNotLoggedin(promise) {
  const SessionStore = StoreProvider.getStore('Session');

  if (!SessionStore.isLoggedIn()) {
    return () => new Promise((resolve, reject) => {
      const SessionActions = ActionsProvider.getActions('Session');

      SessionActions.login.completed.listen(() => {
        promise().then(resolve, reject);
      });
    });
  }

  return promise;
}

export default function fetch(method, url, body?) {
  const promise = () => new Builder(method, url)
    .authenticated()
    .json(body)
    .build();

  return queuePromiseIfNotLoggedin(promise)();
}

export function fetchPlainText(method, url, body) {
  const promise = () => new Builder(method, url)
    .authenticated()
    .plaintext(body)
    .build();

  return queuePromiseIfNotLoggedin(promise)();
}

export function fetchPeriodically(method, url, body?) {
  const promise = () => new Builder(method, url)
    .authenticated()
    .noSessionExtension()
    .json(body)
    .build();

  return queuePromiseIfNotLoggedin(promise)();
}

export function fetchFile(method, url, body, mimeType = 'text/csv') {
  const promise = () => new Builder(method, url)
    .authenticated()
    .file(body, mimeType)
    .build();

  return queuePromiseIfNotLoggedin(promise)();
}
