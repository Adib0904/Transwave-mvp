import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get("live")
  liveness() {
    return { status: "ok", service: "transwave-api" } as const;
  }
}
