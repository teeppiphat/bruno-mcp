/**
 * BRU file generator.
 *
 * Serialization is delegated to Bruno's own `@usebruno/lang` (`jsonToBruV2`)
 * rather than hand-built string concatenation. The previous hand-rolled
 * generator wrapped every value in single quotes (e.g. `name: 'My Request'`),
 * which is NOT Bruno's format — Bruno values are raw to end-of-line, so those
 * files round-tripped with literal quotes baked into the values, and a value
 * containing `'''` produced a file Bruno's parser rejected outright. Using the
 * official serializer guarantees round-trip-correct output and removes the
 * whole class of escaping/injection bugs.
 */
import pkg from '@usebruno/lang';
import {
  BruFile,
  BruAuth,
  BruGeneratorOptions,
  BruValidationError,
  BodyType
} from './types.js';

const { jsonToBruV2 } = pkg as {
  jsonToBruV2: (json: unknown) => string;
};

export class BruGenerator {
  private options: Required<BruGeneratorOptions>;

  constructor(options: BruGeneratorOptions = {}) {
    this.options = {
      indentSize: options.indentSize ?? 2,
      useSpaces: options.useSpaces ?? true,
      addTimestamp: options.addTimestamp ?? false,
      validateSyntax: options.validateSyntax ?? true
    };
  }

  /**
   * Generate a complete .bru file from a BruFile object.
   */
  generateBruFile(bruFile: BruFile): string {
    if (this.options.validateSyntax) {
      this.validateBruFile(bruFile);
    }

    const json = this.toBrunoJson(bruFile);
    let output = jsonToBruV2(json);

    if (this.options.addTimestamp) {
      output = `# Generated on ${new Date().toISOString()}\n\n${output}`;
    }

    return output;
  }

  /**
   * Map our internal BruFile structure to the JSON shape expected by
   * `@usebruno/lang`'s v2 serializer.
   */
  private toBrunoJson(bruFile: BruFile): Record<string, unknown> {
    const json: Record<string, unknown> = {
      meta: {
        name: bruFile.meta.name,
        type: bruFile.meta.type,
        ...(bruFile.meta.seq !== undefined ? { seq: bruFile.meta.seq } : {})
      },
      http: {
        method: bruFile.http.method.toLowerCase(),
        url: bruFile.http.url,
        body: this.mapBodyType(bruFile.http.body),
        auth: this.mapAuthType(bruFile.http.auth)
      }
    };

    // Query parameters -> params:query
    if (bruFile.query && Object.keys(bruFile.query).length > 0) {
      json.params = Object.entries(bruFile.query).map(([name, value]) => ({
        name,
        value: String(value),
        type: 'query',
        enabled: true
      }));
    }

    // Headers -> array form
    if (bruFile.headers && Object.keys(bruFile.headers).length > 0) {
      json.headers = Object.entries(bruFile.headers).map(([name, value]) => ({
        name,
        value: String(value),
        enabled: true
      }));
    }

    // Auth block
    if (bruFile.auth && bruFile.auth.type !== 'none') {
      const auth = this.mapAuth(bruFile.auth);
      if (auth) {
        json.auth = auth;
      }
    }

    // Body block
    if (bruFile.body && bruFile.body.type !== 'none') {
      const body = this.mapBody(bruFile.body);
      if (body) {
        json.body = body;
      }
    }

    // Vars -> vars.req
    if (bruFile.vars && Object.keys(bruFile.vars).length > 0) {
      json.vars = {
        req: Object.entries(bruFile.vars).map(([name, value]) => ({
          name,
          value: String(value),
          enabled: true,
          local: false
        }))
      };
    }

    // Scripts
    if (bruFile.script) {
      const script: Record<string, string> = {};
      if (bruFile.script['pre-request']) {
        script.req = bruFile.script['pre-request'].exec.join('\n');
      }
      if (bruFile.script['post-response']) {
        script.res = bruFile.script['post-response'].exec.join('\n');
      }
      if (Object.keys(script).length > 0) {
        json.script = script;
      }
    }

    // Tests
    if (bruFile.tests && bruFile.tests.exec.length > 0) {
      json.tests = bruFile.tests.exec.join('\n');
    }

    // Docs
    if (bruFile.docs) {
      json.docs = bruFile.docs;
    }

    return json;
  }

  /** Map our BodyType to the value Bruno uses in the `http { body: ... }` line. */
  private mapBodyType(body: BodyType): string {
    switch (body) {
      case 'form-data':
        return 'multipartForm';
      case 'form-urlencoded':
        return 'formUrlEncoded';
      case 'json':
      case 'text':
      case 'xml':
        return body;
      default:
        return 'none';
    }
  }

  /** Map our AuthType to the value Bruno uses in the `http { auth: ... }` line. */
  private mapAuthType(auth: string): string {
    return auth === 'api-key' ? 'apikey' : auth;
  }

  /** Map an auth config to the `@usebruno/lang` auth object. */
  private mapAuth(auth: BruAuth): Record<string, unknown> | null {
    switch (auth.type) {
      case 'bearer':
        return auth.bearer ? { bearer: { token: auth.bearer.token } } : null;
      case 'basic':
        return auth.basic
          ? { basic: { username: auth.basic.username, password: auth.basic.password } }
          : null;
      case 'api-key':
        return auth.apikey
          ? {
              apikey: {
                key: auth.apikey.key,
                value: auth.apikey.value,
                placement: auth.apikey.in
              }
            }
          : null;
      case 'digest':
        return auth.digest
          ? { digest: { username: auth.digest.username, password: auth.digest.password } }
          : null;
      case 'oauth2':
        if (!auth.oauth2) return null;
        return {
          oauth2: {
            grant_type: auth.oauth2.grantType,
            access_token_url: auth.oauth2.accessTokenUrl ?? '',
            authorization_url: auth.oauth2.authorizationUrl ?? '',
            client_id: auth.oauth2.clientId ?? '',
            client_secret: auth.oauth2.clientSecret ?? '',
            scope: auth.oauth2.scope ?? '',
            username: auth.oauth2.username ?? '',
            password: auth.oauth2.password ?? ''
          }
        };
      default:
        return null;
    }
  }

  /** Map a body config to the `@usebruno/lang` body object. */
  private mapBody(body: NonNullable<BruFile['body']>): Record<string, unknown> | null {
    switch (body.type) {
      case 'json':
        return { json: body.content ?? '' };
      case 'text':
        return { text: body.content ?? '' };
      case 'xml':
        return { xml: body.content ?? '' };
      case 'form-data':
        return {
          multipartForm: (body.formData ?? []).map(f => ({
            name: f.name,
            value: f.value,
            type: f.type ?? 'text',
            enabled: f.enabled !== false
          }))
        };
      case 'form-urlencoded':
        return {
          formUrlEncoded: (body.formUrlEncoded ?? []).map(f => ({
            name: f.name,
            value: f.value,
            enabled: f.enabled !== false
          }))
        };
      default:
        return null;
    }
  }

  /**
   * Validate BRU file structure.
   */
  private validateBruFile(bruFile: BruFile): void {
    if (!bruFile.meta || !bruFile.meta.name) {
      throw new BruValidationError('Meta block with name is required');
    }

    if (!bruFile.http || !bruFile.http.method || !bruFile.http.url) {
      throw new BruValidationError('HTTP block with method and URL is required');
    }

    // Validate URL format (basic check)
    if (!this.isValidUrl(bruFile.http.url)) {
      throw new BruValidationError(`Invalid URL format: ${bruFile.http.url}`);
    }

    // Validate auth configuration if present
    if (bruFile.auth && bruFile.auth.type !== 'none') {
      this.validateAuthConfig(bruFile.auth);
    }
  }

  /**
   * Validate authentication configuration.
   */
  private validateAuthConfig(auth: BruAuth): void {
    switch (auth.type) {
      case 'bearer':
        if (!auth.bearer?.token) {
          throw new BruValidationError('Bearer token is required for bearer auth');
        }
        break;
      case 'basic':
        if (!auth.basic?.username || !auth.basic?.password) {
          throw new BruValidationError('Username and password are required for basic auth');
        }
        break;
      case 'api-key':
        if (!auth.apikey?.key || !auth.apikey?.value) {
          throw new BruValidationError('Key and value are required for API key auth');
        }
        break;
    }
  }

  /**
   * Basic URL validation.
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      // Check if it's a relative URL or contains variables
      return url.startsWith('/') || url.includes('{{') || url.startsWith('http');
    }
  }
}

/**
 * Convenience function to generate a BRU file.
 */
export function generateBruFile(bruFile: BruFile, options?: BruGeneratorOptions): string {
  const generator = new BruGenerator(options);
  return generator.generateBruFile(bruFile);
}

/**
 * Create a basic BRU file structure.
 */
export function createBasicBruFile(
  name: string,
  method: string,
  url: string,
  sequence?: number
): BruFile {
  return {
    meta: {
      name,
      type: 'http',
      seq: sequence
    },
    http: {
      method: method.toUpperCase() as any,
      url,
      body: 'none',
      auth: 'none'
    }
  };
}
