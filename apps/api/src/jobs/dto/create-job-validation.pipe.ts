import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateJobDto } from './create-job.dto';

@Injectable()
export class CreateJobValidationPipe implements PipeTransform {
  async transform(value: any, metadata: ArgumentMetadata) {
    // If the target is not the body (e.g. param or query), skip custom validation
    if (metadata.type !== 'body') {
      return value;
    }

    if (Array.isArray(value)) {
      const validatedJobs: CreateJobDto[] = [];
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item !== 'object' || item === null) {
          throw new BadRequestException(
            `Validation failed for job at index ${i}: item must be an object`,
          );
        }
        const jobInstance = plainToInstance(CreateJobDto, item);
        const errors = await validate(jobInstance, {
          whitelist: true,
          forbidNonWhitelisted: true,
        });
        if (errors.length > 0) {
          throw new BadRequestException({
            message: `Validation failed for job at index ${i}`,
            errors: errors
              .map((err) => Object.values(err.constraints || {}))
              .flat(),
          });
        }
        validatedJobs.push(jobInstance);
      }
      return validatedJobs;
    } else {
      if (typeof value !== 'object' || value === null) {
        throw new BadRequestException(
          'Validation failed: body must be an object or an array of objects',
        );
      }
      const jobInstance = plainToInstance(CreateJobDto, value);
      const errors = await validate(jobInstance, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (errors.length > 0) {
        throw new BadRequestException({
          message: 'Validation failed for job',
          errors: errors
            .map((err) => Object.values(err.constraints || {}))
            .flat(),
        });
      }
      return jobInstance;
    }
  }
}
