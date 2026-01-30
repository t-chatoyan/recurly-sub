/**
 * Tests for rescue.js main entry point
 * Using Node.js built-in test runner (node --test)
 *
 * Note: Tests that manipulate .env file may conflict when run in parallel.
 * Run with --test-concurrency=1 if experiencing flaky tests:
 *   node --test --test-concurrency=1
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const rescuePath = path.join(process.cwd(), 'rescue.js');
const envPath = path.join(process.cwd(), '.env');

describe('rescue.js CLI', () => {
  let envExisted = false;
  let originalEnvContent = null;

  beforeEach(() => {
    // Check if .env exists and backup
    envExisted = fs.existsSync(envPath);
    if (envExisted) {
      originalEnvContent = fs.readFileSync(envPath, 'utf8');
    }
  });

  afterEach(() => {
    // Restore original .env
    if (envExisted && originalEnvContent !== null) {
      fs.writeFileSync(envPath, originalEnvContent);
    } else if (!envExisted && fs.existsSync(envPath)) {
      fs.unlinkSync(envPath);
    }
  });

  describe('--env argument validation', () => {
    it('should exit with error when --env is missing', () => {
      // Create valid .env for this test
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key');

      try {
        execSync(`node ${rescuePath} --project=eur`, { encoding: 'utf8', stdio: 'pipe' });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.status === 1, 'Should exit with code 1');
        assert.ok(error.stderr.includes('Missing required argument: --env'), 'Should show missing --env error');
      }
    });

    it('should exit with error when --env value is invalid', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key');

      try {
        execSync(`node ${rescuePath} --env=invalid --project=eur`, { encoding: 'utf8', stdio: 'pipe' });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.status === 1, 'Should exit with code 1');
        assert.ok(error.stderr.includes('Invalid --env value'), 'Should show invalid --env error');
      }
    });

    it('should accept --env=sandbox with --project', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key-123\nSKIP_API_CALLS=true');

      const output = execSync(`node ${rescuePath} --env=sandbox --project=eur`, { encoding: 'utf8', stdio: 'pipe' });
      assert.ok(output.includes('Configuration loaded for sandbox environment'), 'Should load sandbox config');
      assert.ok(output.includes('Project: EUR Project (eur)'), 'Should display project');
    });

    it('should accept --env=production with --project (with confirmation)', async () => {
      fs.writeFileSync(envPath, 'RECURLY_PRODUCTION_API_KEY=test-key-456\nSKIP_API_CALLS=true');

      // Production requires interactive confirmation, use spawn with stdin
      const result = await new Promise((resolve, reject) => {
        const child = spawn('node', [rescuePath, '--env=production', '--project=eur'], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        // [M3 FIX] Store timeout reference for cleanup
        const timeoutId = setTimeout(() => {
          child.kill();
          reject(new Error('Test timeout'));
        }, 5000);

        child.stdout.on('data', (data) => {
          stdout += data.toString();
          // When we see the confirmation prompt, send 'y'
          if (stdout.includes('Continue? (y/n)')) {
            child.stdin.write('y\n');
            child.stdin.end();
          }
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          clearTimeout(timeoutId); // [M3 FIX] Clear timeout on success
          resolve({ code, stdout, stderr });
        });

        child.on('error', (err) => {
          clearTimeout(timeoutId); // [M3 FIX] Clear timeout on error
          reject(err);
        });
      });

      assert.strictEqual(result.code, 0, 'Should exit with code 0');
      assert.ok(result.stdout.includes('WARNING: PRODUCTION ENVIRONMENT'), 'Should show production warning');
      assert.ok(result.stdout.includes('Configuration loaded for production environment'), 'Should load production config');
    });

    it('should exit gracefully when user declines production confirmation', async () => {
      fs.writeFileSync(envPath, 'RECURLY_PRODUCTION_API_KEY=test-key-456\nSKIP_API_CALLS=true');

      // Production confirmation declined with 'n'
      const result = await new Promise((resolve, reject) => {
        const child = spawn('node', [rescuePath, '--env=production', '--project=eur'], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        // [M3 FIX] Store timeout reference for cleanup
        const timeoutId = setTimeout(() => {
          child.kill();
          reject(new Error('Test timeout'));
        }, 5000);

        child.stdout.on('data', (data) => {
          stdout += data.toString();
          // When we see the confirmation prompt, send 'n'
          if (stdout.includes('Continue? (y/n)')) {
            child.stdin.write('n\n');
            child.stdin.end();
          }
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          clearTimeout(timeoutId); // [M3 FIX] Clear timeout on success
          resolve({ code, stdout, stderr });
        });

        child.on('error', (err) => {
          clearTimeout(timeoutId); // [M3 FIX] Clear timeout on error
          reject(err);
        });
      });

      assert.strictEqual(result.code, 0, 'Should exit with code 0 (graceful exit)');
      assert.ok(result.stdout.includes('WARNING: PRODUCTION ENVIRONMENT'), 'Should show production warning');
      assert.ok(result.stdout.includes('Operation cancelled by user'), 'Should show cancellation message');
      assert.ok(!result.stdout.includes('Configuration loaded'), 'Should NOT load config after cancellation');
    });
  });

  describe('--project argument validation', () => {
    it('should exit with error when --project is missing', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key');

      try {
        execSync(`node ${rescuePath} --env=sandbox`, { encoding: 'utf8', stdio: 'pipe' });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.status === 1, 'Should exit with code 1');
        assert.ok(error.stderr.includes('Missing required argument: --project'), 'Should show missing --project error');
      }
    });

    it('should display project in output', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nSKIP_API_CALLS=true');

      const output = execSync(`node ${rescuePath} --env=sandbox --project=multi`, { encoding: 'utf8', stdio: 'pipe' });
      assert.ok(output.includes('Project: Multi-Currency Project (multi)'), 'Should display project name');
    });
  });

  describe('argument conflict detection', () => {
    it('should exit with error when --dry-run and --rollback are both provided', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key');

      try {
        execSync(`node ${rescuePath} --env=sandbox --project=eur --dry-run --rollback=file.json`, { encoding: 'utf8', stdio: 'pipe' });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.status === 1, 'Should exit with code 1');
        assert.ok(error.stderr.includes('Cannot combine --dry-run with --rollback'), 'Should show conflict error');
      }
    });

    it('should exit with error when --confirm-every and --no-confirm are both provided', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key');

      try {
        execSync(`node ${rescuePath} --env=sandbox --project=eur --confirm-every=50 --no-confirm`, { encoding: 'utf8', stdio: 'pipe' });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.status === 1, 'Should exit with code 1');
        assert.ok(error.stderr.includes('Cannot use both --confirm-every and --no-confirm'), 'Should show conflict error');
      }
    });
  });

  describe('optional arguments display', () => {
    it('should display DRY-RUN mode when --dry-run is provided', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nSKIP_API_CALLS=true');

      const output = execSync(`node ${rescuePath} --env=sandbox --project=eur --dry-run`, { encoding: 'utf8', stdio: 'pipe' });
      assert.ok(output.includes('Mode: DRY-RUN'), 'Should display dry-run mode');
    });

    it('should display ROLLBACK mode when --rollback is provided', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nSKIP_API_CALLS=true');

      const output = execSync(`node ${rescuePath} --env=sandbox --project=eur --rollback=results.json`, { encoding: 'utf8', stdio: 'pipe' });
      assert.ok(output.includes('Mode: ROLLBACK from results.json'), 'Should display rollback mode');
    });

    it('should display client-id when --client-id is provided', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nSKIP_API_CALLS=true');

      const output = execSync(`node ${rescuePath} --env=sandbox --project=eur --client-id=abc123`, { encoding: 'utf8', stdio: 'pipe' });
      assert.ok(output.includes('Target: Single client abc123'), 'Should display target client');
    });

    it('should display default confirmation every 100 clients', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nSKIP_API_CALLS=true');

      const output = execSync(`node ${rescuePath} --env=sandbox --project=eur`, { encoding: 'utf8', stdio: 'pipe' });
      assert.ok(output.includes('Confirmation: Every 100 clients'), 'Should display default confirmation interval');
    });

    it('should display custom confirmation interval when --confirm-every is provided', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nSKIP_API_CALLS=true');

      const output = execSync(`node ${rescuePath} --env=sandbox --project=eur --confirm-every=25`, { encoding: 'utf8', stdio: 'pipe' });
      assert.ok(output.includes('Confirmation: Every 25 clients'), 'Should display custom confirmation interval');
    });

    it('should display continuous mode when --no-confirm is provided', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nSKIP_API_CALLS=true');

      const output = execSync(`node ${rescuePath} --env=sandbox --project=eur --no-confirm`, { encoding: 'utf8', stdio: 'pipe' });
      assert.ok(output.includes('Confirmation: Disabled (continuous mode)'), 'Should display continuous mode');
    });

    it('should display resume mode when --resume is provided', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nSKIP_API_CALLS=true');

      const output = execSync(`node ${rescuePath} --env=sandbox --project=eur --resume`, { encoding: 'utf8', stdio: 'pipe' });
      assert.ok(output.includes('Resume: Will attempt to resume from state file'), 'Should display resume mode');
    });
  });

  describe('.env error handling', () => {
    it('should exit with error when .env file is missing', () => {
      // Ensure no .env file exists
      if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }

      try {
        execSync(`node ${rescuePath} --env=sandbox --project=eur`, { encoding: 'utf8', stdio: 'pipe' });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.status === 1, 'Should exit with code 1');
        assert.ok(error.stderr.includes('.env file not found'), 'Should show .env not found error');
      }
    });

    it('should exit with error when required API key is missing', () => {
      // Create .env with wrong key
      fs.writeFileSync(envPath, 'RECURLY_PRODUCTION_API_KEY=wrong-key');

      try {
        execSync(`node ${rescuePath} --env=sandbox --project=eur`, { encoding: 'utf8', stdio: 'pipe' });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.status === 1, 'Should exit with code 1');
        assert.ok(error.stderr.includes('Missing required environment variable'), 'Should show missing key error');
      }
    });
  });

  describe('security - API key not logged', () => {
    it('should not display API key in output', () => {
      const secretKey = 'super-secret-api-key-12345';
      fs.writeFileSync(envPath, `RECURLY_SANDBOX_API_KEY=${secretKey}\nSKIP_API_CALLS=true`);

      const output = execSync(`node ${rescuePath} --env=sandbox --project=eur`, { encoding: 'utf8', stdio: 'pipe' });

      assert.ok(!output.includes(secretKey), 'API key should not appear in output');
    });
  });

  describe('environment display (Story 1.3)', () => {
    it('should display environment info with API URL', () => {
      fs.writeFileSync(envPath, 'RECURLY_SANDBOX_API_KEY=test-key\nSKIP_API_CALLS=true');

      const output = execSync(`node ${rescuePath} --env=sandbox --project=eur`, { encoding: 'utf8', stdio: 'pipe' });

      assert.ok(output.includes('Environment: sandbox'), 'Should display environment name');
      assert.ok(output.includes('https://v3.recurly.com'), 'Should display API URL');
    });
  });

  describe('--help flag (Story 1.4)', () => {
    it('should display help and exit with code 0', () => {
      // --help should work even without .env file
      if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }

      const output = execSync(`node ${rescuePath} --help`, { encoding: 'utf8', stdio: 'pipe' });

      // Verify help content
      assert.ok(output.includes('Recurly Rescue Script'), 'Should include script title');
      assert.ok(output.includes('USAGE:'), 'Should include usage section');
      assert.ok(output.includes('REQUIRED ARGUMENTS:'), 'Should include required args section');
      assert.ok(output.includes('OPTIONAL ARGUMENTS:'), 'Should include optional args section');
      assert.ok(output.includes('EXAMPLES:'), 'Should include examples section');
      assert.ok(output.includes('NOTES:'), 'Should include notes section');

      // Verify argument documentation
      assert.ok(output.includes('--env=<sandbox|production>'), 'Should document --env');
      assert.ok(output.includes('--project=<id>'), 'Should document --project');
      assert.ok(output.includes('--help'), 'Should document --help');
      assert.ok(output.includes('--dry-run'), 'Should document --dry-run');
      assert.ok(output.includes('--client-id'), 'Should document --client-id');
      assert.ok(output.includes('--confirm-every'), 'Should document --confirm-every');
      assert.ok(output.includes('--no-confirm'), 'Should document --no-confirm');
      assert.ok(output.includes('--rollback'), 'Should document --rollback');
      assert.ok(output.includes('--resume'), 'Should document --resume');
    });

    it('should exit with code 0 when --help is provided', () => {
      // Verify exit code is 0 (success)
      const result = execSync(`node ${rescuePath} --help`, { encoding: 'utf8', stdio: 'pipe' });
      // execSync only throws on non-zero exit codes, so if we reach here, exit code was 0
      assert.ok(true, 'Should exit with code 0');
    });

    it('should display help before processing other arguments', () => {
      // --help should work even with missing required args
      const output = execSync(`node ${rescuePath} --help`, { encoding: 'utf8', stdio: 'pipe' });

      // Should show help, not missing argument error
      assert.ok(output.includes('USAGE:'), 'Should display help');
      assert.ok(!output.includes('ERROR'), 'Should not show errors');
    });

    it('should include --resume example in help', () => {
      const output = execSync(`node ${rescuePath} --help`, { encoding: 'utf8', stdio: 'pipe' });

      // Verify --resume example exists
      assert.ok(output.includes('# Resume from last interrupted execution'), 'Should include resume example comment');
      assert.ok(output.includes('--resume'), 'Should include --resume flag in examples');
    });

    it('should mention .env file requirement in notes', () => {
      const output = execSync(`node ${rescuePath} --help`, { encoding: 'utf8', stdio: 'pipe' });

      // Verify .env requirement is documented
      assert.ok(output.includes('Requires .env file'), 'Should mention .env file requirement');
      assert.ok(output.includes('RECURLY_SANDBOX_API_KEY'), 'Should mention sandbox API key');
      assert.ok(output.includes('RECURLY_PRODUCTION_API_KEY'), 'Should mention production API key');
    });
  });
});
