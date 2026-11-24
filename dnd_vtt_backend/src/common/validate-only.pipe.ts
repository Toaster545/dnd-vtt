import { BadRequestException, PipeTransform } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

// The global ValidationPipe runs with `whitelist: true`, which strips every property a DTO does
// not declare. That is wrong for the character endpoints, whose body is an open-ended JSON blob:
// we want the handful of typed fields checked and everything else passed through untouched.
//
// Type the `@Body()` parameter as `Record<string, unknown>` (the global pipe skips plain
// objects) and attach this pipe: it validates a throwaway DTO instance and hands the original
// body on, so `'key' in body` checks in the service still mean "the client sent it".
export class ValidateOnlyPipe<T extends object> implements PipeTransform {
  constructor(private readonly dto: new () => T) {}

  async transform(value: unknown) {
    if (value == null) return {};
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Request body must be a JSON object.');
    }
    const errors = await validate(plainToInstance(this.dto, value) as object, {
      whitelist: false,
      forbidUnknownValues: false,
    });
    if (errors.length) {
      throw new BadRequestException(
        errors.flatMap((error) => Object.values(error.constraints ?? {})),
      );
    }
    return value;
  }
}
