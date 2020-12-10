import { AddressInfo } from 'net';
import { EventEmitter } from 'events';

/**
 * A mock server that does nothing. This is a partial type.
 */
export default class MockServer extends EventEmitter {
  _closeError: Error | null = null;
  _listenError: Error | null = null;
  _address: AddressInfo | string | null = null;
  _mockAddress?: AddressInfo | string | null;
  _listening = false;

  close(closeCallback?: (err?: Error) => void): void {
    setTimeout(() => {
      if (this._closeError) {
        if (closeCallback) {
          closeCallback(this._closeError);
        }
        this.emit('error', this._closeError);
      } else {
        if (closeCallback) {
          closeCallback();
        }
      }
      this._listening = false;
    }, 0);
  }

  listen(port?: number, hostname?: string, listeningListener?: () => void): this;
  listen(port?: number, listeningListener?: () => void): this;
  listen(port?: number, hostnameOrListener?: string | (() => void), listeningListener?: () => void): this {
    if (this._listening) {
      const error: NodeJS.ErrnoException = new Error('ERR_SERVER_ALREADY_LISTEN');
      error.code = 'ERR_SERVER_ALREADY_LISTEN';
      throw error;
    }
    if (!listeningListener) {
      if (typeof hostnameOrListener === 'function') {
        listeningListener = hostnameOrListener;
      }
    }
    if (listeningListener) {
      this.on('listening', listeningListener);
    }
    const host = (typeof hostnameOrListener === 'string') ? hostnameOrListener : '';
    this._address = {
      address: host,
      // If the port is undefined or 0, the OS would pick a port that would
      // likely be in the 50000 or so range, so just always set it to that.
      port: (port === 0 || port === undefined) ? 50000 : port,
      family: 'tcp'
    };
    // Mock the listening completeing
    setTimeout(() => {
      if (this._listenError) {
        this.emit('error', this._listenError);
      } else {
        this.emit('listening');
      }
    }, 0);
    this._listening = true;
    return this;
  }
  address(): AddressInfo | string | null {
    return this._mockAddress !== undefined? this._mockAddress : this._address;
  }
  /**
   * Sets the address returned by address - if given with no
   * arguments/undefined, address returns the address as sent to listen().
   * @param address the address as returned by address()
   */
  mockAddress(address?: AddressInfo | string | null): void {
    this._mockAddress = address;
  }
  /**
   * Mock an error after close.
   * @param error the error to emit after close is called
   */
  mockErrorOnClose(error?: Error): void {
    this._closeError = error ? error : null;
  }
  /**
   * Mock an error after listen.
   * @param error the error to emit after listen is called
   */
  mockErrorOnListen(error?: Error): void {
    this._listenError = error ? error : null;
  }
}
