---
name: nestjs-module
description: "Use this skill whenever adding a new NestJS module to the Auxtion API. Contains the exact boilerplate, patterns, and conventions used across the codebase. Read before creating any new module, service, controller, or DTO."
---

# NestJS Module — Auxtion API Conventions

## Module Structure

```
apps/api/src/modules/foo/
├── foo.module.ts
├── foo.controller.ts
├── foo.service.ts
└── dto/
    ├── create-foo.dto.ts
    └── update-foo.dto.ts
```

---

## Templates

### `foo.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { FooController } from './foo.controller';
import { FooService } from './foo.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FooController],
  providers: [FooService],
  exports: [FooService],  // export if other modules need it
})
export class FooModule {}
```

### `foo.controller.ts`

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FooService } from './foo.service';
import { CreateFooDto } from './dto/create-foo.dto';
import { UpdateFooDto } from './dto/update-foo.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

interface AuthUser {
  id: string;
  role: UserRole;
}

@Controller('foos')
@UseGuards(JwtAuthGuard)
export class FooController {
  constructor(private readonly fooService: FooService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFooDto) {
    return this.fooService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.fooService.findAll(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.fooService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFooDto,
  ) {
    return this.fooService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.fooService.remove(user.id, id);
  }
}
```

### `foo.service.ts`

```typescript
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFooDto } from './dto/create-foo.dto';
import { UpdateFooDto } from './dto/update-foo.dto';

@Injectable()
export class FooService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateFooDto) {
    return this.prisma.foo.create({
      data: {
        userId,
        ...dto,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.foo.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const foo = await this.prisma.foo.findUnique({
      where: { id },
    });
    if (!foo) throw new NotFoundException('Not found');
    return foo;
  }

  async update(userId: string, id: string, dto: UpdateFooDto) {
    const foo = await this.prisma.foo.findUnique({ where: { id } });
    if (!foo) throw new NotFoundException('Not found');
    if (foo.userId !== userId) throw new ForbiddenException('Not your resource');

    return this.prisma.foo.update({
      where: { id },
      data: dto,
    });
  }

  async remove(userId: string, id: string) {
    const foo = await this.prisma.foo.findUnique({ where: { id } });
    if (!foo) throw new NotFoundException('Not found');
    if (foo.userId !== userId) throw new ForbiddenException('Not your resource');

    // Soft delete — update status, never hard delete
    return this.prisma.foo.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
```

### `dto/create-foo.dto.ts`

```typescript
import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  MinLength,
  Min,
} from 'class-validator';

export class CreateFooDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsInt()
  @Min(1)
  price: number;  // centavos

  @IsString()
  @IsOptional()
  description?: string;
}
```

### `dto/update-foo.dto.ts`

```typescript
import { PartialType } from '@nestjs/mapped-types';
import { CreateFooDto } from './create-foo.dto';

export class UpdateFooDto extends PartialType(CreateFooDto) {}
```

---

## Registering in App Module

**File:** `apps/api/src/app.module.ts`

```typescript
import { FooModule } from './modules/foo/foo.module';

@Module({
  imports: [
    // ... existing modules
    FooModule,
  ],
})
export class AppModule {}
```

---

## Injecting Another Service

If a module needs to call another module's service (e.g., FooService needs BiddingGateway):

1. Export the service from its module:
```typescript
// bidding.module.ts
exports: [BiddingGateway]
```

2. Import the module:
```typescript
// foo.module.ts
imports: [PrismaModule, BiddingModule]
```

3. Inject in constructor:
```typescript
// foo.service.ts
constructor(
  private readonly prisma: PrismaService,
  private readonly biddingGateway: BiddingGateway,
) {}
```

---

## Validation

Global `ValidationPipe` is already configured in `main.ts`. DTOs with class-validator decorators are automatically validated on all endpoints.

Common decorators:
```typescript
@IsString()
@IsInt()
@IsBoolean()
@IsOptional()
@IsEnum(MyEnum)
@MinLength(1)
@Min(0)
@IsArray()
@IsUUID()
```

---

## Error Handling

Always use NestJS built-in exceptions — they map to correct HTTP status codes automatically:

```typescript
throw new NotFoundException('Item not found');           // 404
throw new ForbiddenException('You do not own this');     // 403
throw new BadRequestException('Invalid request');         // 400
throw new UnauthorizedException('Not authenticated');    // 401
throw new ConflictException('Already exists');           // 409
```

---

## Response Shape

All responses are automatically wrapped by `ResponseInterceptor` in `main.ts`:

```json
{
  "data": { ...yourReturnValue }
}
```

Frontend reads `response.data.data`. Don't manually wrap responses.

---

## Money Convention

All money values stored and transmitted as **centavos** (integers):
- ₱1 = 100
- ₱500 = 50000
- ₱1,000 = 100000

Never store floats. Never divide/multiply in the DB — do it in service layer.

---

## Checklist for New Module

- [ ] Create module folder in `apps/api/src/modules/`
- [ ] Create `module.ts`, `controller.ts`, `service.ts`, `dto/` files
- [ ] Add Prisma model to `schema.prisma`
- [ ] Run migration from `apps/api/` with public Railway URL
- [ ] Register module in `app.module.ts`
- [ ] Test endpoints via API client
- [ ] Add frontend API service in `apps/mobile/src/services/api/`
- [ ] Commit migration files alongside code changes