# Common Issues

Frequently encountered problems and their solutions.

## Development Issues

### Port Already in Use

**Symptom:** `Error: listen EADDRINUSE: address already in use :::3000`

**Solution:**

```bash
# Find process using the port
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3001 npm run dev
```

### MongoDB Connection Failed

**Symptom:** `MongoServerSelectionError: connect ECONNREFUSED`

**Solutions:**

1. **Check if MongoDB is running:**

```bash
docker-compose ps
# If not running:
docker-compose up -d mongodb
```

2. **Check MongoDB logs:**

```bash
docker-compose logs mongodb
```

3. **Verify connection string:**

```bash
# In server/.env
MONGODB_URI=mongodb://localhost:27017/intact
```

4. **Restart MongoDB:**

```bash
docker-compose restart mongodb
```

### Module Not Found

**Symptom:** `Cannot find module 'package-name'`

**Solutions:**

1. **Clean reinstall:**

```bash
rm -rf node_modules package-lock.json
npm install
```

2. **Check you're in the correct directory:**

```bash
# For client packages
cd client && npm install

# For server packages
cd server && npm install
```

### TypeScript Errors

**Symptom:** Type errors during build or development

**Solutions:**

1. **Run type check:**

```bash
npm run typecheck
```

2. **Clear TypeScript cache:**

```bash
rm -rf client/.tsbuildinfo server/.tsbuildinfo
```

3. **Restart TypeScript server in VS Code:**

- Cmd/Ctrl + Shift + P
- "TypeScript: Restart TS Server"

## Authentication Issues

### JWT Token Invalid

**Symptom:** `401 Unauthorized` or `JsonWebTokenError`

**Solutions:**

1. **Clear browser storage:**

- Open DevTools > Application > Local Storage
- Delete `token` and `user` entries

2. **Check JWT_SECRET:**

```bash
# Ensure JWT_SECRET is set in server/.env
cat server/.env | grep JWT_SECRET
```

3. **Re-login:**

- Navigate to `/login`
- Enter credentials again

### Login Fails with Correct Credentials

**Symptom:** Login returns error despite correct password

**Solutions:**

1. **Reseed the database:**

```bash
cd server && npm run seed
```

2. **Check password in database:**

```bash
docker-compose exec mongodb mongosh intact \
--eval "db.users.findOne({username: 'admin'})"
```

3. **Verify bcrypt is working:**

- Ensure `bcrypt` package is installed
- Check for native module issues

## Database Issues

### Data Not Persisting

**Symptom:** Data disappears after restart

**Solutions:**

1. **Check Docker volume:**

```bash
docker volume ls | grep mongodb
```

2. **Verify volume mount in docker-compose.yml:**

```yaml
volumes:
  - mongodb_data:/data/db
```

### Database Seeding Fails

**Symptom:** `npm run seed` fails or times out

**Solutions:**

1. **Ensure MongoDB is running:**

```bash
docker-compose up -d mongodb
```

2. **Wait for MongoDB to be ready:**

```bash
docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')"
```

3. **Check for existing data conflicts:**

```bash
# Clear existing data
docker-compose exec mongodb mongosh intact --eval "db.dropDatabase()"
npm run seed
```

## Frontend Issues

### Blank Page After Build

**Symptom:** Production build shows blank page

**Solutions:**

1. **Check for console errors:**

- Open browser DevTools
- Check Console and Network tabs

2. **Verify base path:**

```typescript
// vite.config.ts
export default defineConfig({
  base: '/', // Adjust if deployed to subdirectory
});
```

3. **Check API URL:**

```bash
# In client/.env
VITE_API_URL=http://localhost:3000
```

### React Query Not Updating

**Symptom:** Data doesn't refresh after mutation

**Solutions:**

1. **Check query invalidation:**

```typescript
const mutation = useMutation({
  mutationFn: createService,
  onSuccess: () => {
    // Ensure this is called
    queryClient.invalidateQueries({ queryKey: ['services'] });
  },
});
```

2. **Force refetch:**

```typescript
const { refetch } = useQuery(['services'], getServices);
// Call refetch() manually
```

### Topology Editor Not Loading

**Symptom:** Canvas doesn't render or shows errors

**Solutions:**

1. **Check React Flow styles:**

```typescript
// Ensure CSS is imported
import '@xyflow/react/dist/style.css';
```

2. **Verify container dimensions:**

```tsx
// Canvas container needs explicit dimensions
<div style={{ width: '100%', height: '500px' }}>
  <ReactFlow />
</div>
```

## Build Issues

### Build Fails with Memory Error

**Symptom:** `JavaScript heap out of memory`

**Solution:**

```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### ESLint Errors Block Commit

**Symptom:** Pre-commit hook fails on lint errors

**Solutions:**

1. **Fix lint errors:**

```bash
npm run lint:fix
```

2. **Bypass for urgent commits (not recommended):**

```bash
git commit --no-verify -m "message"
```

## Docker Issues

### Container Keeps Restarting

**Symptom:** Container status shows `Restarting`

**Solutions:**

1. **Check logs:**

```bash
docker-compose logs <service-name>
```

2. **Verify environment variables:**

```bash
docker-compose exec <service> env
```

3. **Check for port conflicts:**

```bash
docker-compose down
lsof -i :80 -i :3000 -i :27017
```

### Image Build Fails

**Symptom:** Docker build fails

**Solutions:**

1. **Clear build cache:**

```bash
docker-compose build --no-cache
```

2. **Check Dockerfile syntax:**

- Ensure multi-stage builds complete
- Verify COPY paths exist

## Related Documentation

- [Debugging Guide](debugging.md)
- [Development Playbook](../playbooks/development.md)
- [Deployment Playbook](../playbooks/deployment.md)
