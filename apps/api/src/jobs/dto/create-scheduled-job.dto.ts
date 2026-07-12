import {
  IsString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import * as cronParser from 'cron-parser';

export function IsCronExpression(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isCronExpression',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          try {
            cronParser.default.parse(value);
            return true;
          } catch (e) {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid cron expression`;
        },
      },
    });
  };
}

export class CreateScheduledJobDto {
  @IsString()
  @IsNotEmpty()
  @IsCronExpression()
  cron_expression!: string;

  @IsObject()
  job_template!: any;

  @IsOptional()
  @IsString()
  timezone?: string;
}
