import { ChangeDetectionStrategy, Component } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter, RouterOutlet } from "@angular/router";
import { createRegistry, defineListSchema } from "@querykitjs/web";
import { injectListParams } from "@querykitjs/web/angular";

const users = createRegistry({ adapter: "drizzle-pg" }).resource<{ id: number; name: string }>("users");
const schema = defineListSchema({ name: { operation: "%_%" } });

@Component({
  selector: "app-users",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button (click)="list.setPage(2)">{{ list.params().page }}</button>`,
})
class UsersPage {
  readonly list = injectListParams(users, { schema });
}

@Component({ selector: "app-root", imports: [RouterOutlet], template: "<router-outlet />" })
class AppRoot {}

void bootstrapApplication(AppRoot, { providers: [provideRouter([{ path: "", component: UsersPage }])] });
