import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminGuard } from './guards/admin.guard';
import { CreateApiTokenDto } from './dto/api-token.dto';
import {
  AdminApiTokenView,
  ApiTokenService,
  ApiTokenView,
} from './services/api-token.service';

type AuthenticatedRequest = Request & { user: { id: string } };

/**
 * Token management uses the normal session cookie (global JwtAuthGuard),
 * so an API token can never be used to create or list other tokens.
 */
@Controller('auth/api-tokens')
export class ApiTokenController {
  constructor(private readonly apiTokenService: ApiTokenService) {}

  @Get()
  listOwn(@Req() request: AuthenticatedRequest): Promise<ApiTokenView[]> {
    return this.apiTokenService.listForUser(request.user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateApiTokenDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ token: string; apiToken: ApiTokenView }> {
    return this.apiTokenService.create(request.user.id, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async revokeAllOwn(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ revoked: number }> {
    const revoked = await this.apiTokenService.revokeAllForUser(
      request.user.id,
    );
    return { revoked };
  }

  @Get('all')
  @UseGuards(AdminGuard)
  listAll(): Promise<AdminApiTokenView[]> {
    return this.apiTokenService.listAll();
  }

  @Delete('all/:id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  revokeAny(@Param('id', ParseUUIDPipe) id: string): Promise<ApiTokenView> {
    return this.apiTokenService.revokeAny(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  revokeOwn(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiTokenView> {
    return this.apiTokenService.revokeOwn(request.user.id, id);
  }
}
