import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnvironment } from "./config/environment.js";
import { HealthModule } from "./health/health.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { InvoicesModule } from "./invoices/invoices.module.js";
import { AccountModule } from "./account/account.module.js";
import { MastersModule } from "./masters/masters.module.js";
import { UsersModule } from "./users/users.module.js";
import { VendorBillsModule } from "./vendor-bills/vendor-bills.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnvironment }),
    DatabaseModule,
    HealthModule,
    JobsModule,
    InvoicesModule,
    AccountModule,
    MastersModule,
    UsersModule,
    VendorBillsModule
  ]
})
export class AppModule {}
