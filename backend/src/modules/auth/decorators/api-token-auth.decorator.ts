import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiTokenGuard } from '../guards/api-token.guard';

export const API_TOKEN_AUTH_KEY = 'apiTokenAuth';

/**
 * Authenticates the route with a Bearer API token instead of the session
 * cookie. The metadata and the guard are applied together, so the global
 * JwtAuthGuard can only be skipped when ApiTokenGuard runs in its place.
 */
export const ApiTokenAuth = () =>
  applyDecorators(
    SetMetadata(API_TOKEN_AUTH_KEY, true),
    UseGuards(ApiTokenGuard),
  );
