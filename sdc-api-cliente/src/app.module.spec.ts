import { readFileSync } from 'fs';
import { join } from 'path';

describe('AppModule advisor middleware dependencies', () => {
  it('imports the advisor scope in the root middleware context', () => {
    const source = readFileSync(join(__dirname, 'app.module.ts'), 'utf8');

    expect(source).toContain(
      "import { AdvisorScopeModule } from './auxiliares/authorization/advisor-scope.module';",
    );
    expect(source).toMatch(/imports:\s*\[[\s\S]*AdvisorScopeModule,/);
  });
});
