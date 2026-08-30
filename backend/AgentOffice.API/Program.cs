using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using AgentOffice.API.Data;
using AgentOffice.API.Services;
using AgentOffice.API.Events;
using AgentOffice.API.Hubs;
using AgentOffice.API.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(o =>
        o.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSignalR();
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(builder.Configuration["DataProtection:KeysPath"] ?? "keys"))
    .SetApplicationName("AgentOffice");
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "AgentOffice API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new()
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
    });
    c.AddSecurityRequirement(new()
    {
        {
            new() { Reference = new() { Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme, Id = "Bearer" } },
            []
        }
    });
});

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Data Source=agentoffice.db"));

builder.Services.AddScoped<IDocumentService, DocumentService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IWorkspaceService, WorkspaceService>();
builder.Services.AddScoped<IFolderService, FolderService>();
builder.Services.AddScoped<IChatService, ChatService>();
builder.Services.AddScoped<IAgentTaskService, AgentTaskService>();
builder.Services.AddScoped<IAgentScheduleService, AgentScheduleService>();
builder.Services.AddHostedService<AgentScheduleWorker>();
builder.Services.AddScoped<IAgentIdentity, AgentIdentityService>();
builder.Services.AddScoped<IAgentDirectory, AgentDirectoryService>();
builder.Services.AddScoped<IEventPublisher, EventPublisher>();
builder.Services.AddScoped<IEventHandler<MessageCreatedEvent>, ChatMessageBroadcastHandler>();
builder.Services.AddScoped<IEventHandler<MessageCreatedEvent>, AgentChatDispatchHandler>();
builder.Services.AddScoped<IEventHandler<AgentTaskCreatedEvent>, AgentTaskCreatedBroadcastHandler>();
builder.Services.AddScoped<IEventHandler<AgentTaskUpdatedEvent>, AgentTaskUpdatedBroadcastHandler>();
builder.Services.AddScoped<IEventHandler<AgentTaskEventCreatedEvent>, AgentTaskEventBroadcastHandler>();
builder.Services.AddScoped<IEventHandler<DocumentCreatedEvent>, DocumentCreatedBroadcastHandler>();
builder.Services.AddScoped<IEventHandler<DocumentRenamedEvent>, DocumentRenamedBroadcastHandler>();
builder.Services.AddScoped<IEventHandler<DocumentDeletedEvent>, DocumentDeletedBroadcastHandler>();
builder.Services.AddSingleton<IWopiTokenService, WopiTokenService>();
builder.Services.AddHttpClient();

var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt:Key is not configured.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(accessToken) && context.HttpContext.Request.Path.StartsWithSegments("/hubs/chat"))
                    context.Token = accessToken;
                return Task.CompletedTask;
            },
        };
    });

builder.Services.AddAuthorization();

var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:5173", "http://localhost"];

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();

    // Idempotent: add Users table when upgrading an existing database.
    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "Users" (
            "Id"           TEXT NOT NULL CONSTRAINT "PK_Users" PRIMARY KEY,
            "Username"     TEXT NOT NULL,
            "Email"        TEXT NOT NULL,
            "PasswordHash" TEXT NOT NULL,
            "CreatedAt"    TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "IX_Users_Email"     ON "Users" ("Email");
        CREATE UNIQUE INDEX IF NOT EXISTS "IX_Users_Username"  ON "Users" ("Username");
        """);

    // Idempotent: add Workspace tables when upgrading an existing database.
    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "Workspaces" (
            "Id"          TEXT NOT NULL CONSTRAINT "PK_Workspaces" PRIMARY KEY,
            "Name"        TEXT NOT NULL,
            "Description" TEXT,
            "CreatedAt"   TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS "WorkspaceUsers" (
            "WorkspaceId" TEXT NOT NULL,
            "UserId"      TEXT NOT NULL,
            "Role"        TEXT NOT NULL DEFAULT 'Member',
            "JoinedAt"    TEXT NOT NULL,
            CONSTRAINT "PK_WorkspaceUsers" PRIMARY KEY ("WorkspaceId", "UserId")
        );
        """);

    // Idempotent: add Folders table when upgrading an existing database.
    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "Folders" (
            "Id"             TEXT NOT NULL CONSTRAINT "PK_Folders" PRIMARY KEY,
            "Name"           TEXT NOT NULL,
            "CreatedAt"      TEXT NOT NULL,
            "WorkspaceId"    TEXT NOT NULL,
            "ParentFolderId" TEXT NULL,
            CONSTRAINT "FK_Folders_Workspaces_WorkspaceId" FOREIGN KEY ("WorkspaceId") REFERENCES "Workspaces" ("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "IX_Folders_WorkspaceId"    ON "Folders" ("WorkspaceId");
        CREATE INDEX IF NOT EXISTS "IX_Folders_ParentFolderId" ON "Folders" ("ParentFolderId");
        """);
    // Idempotent: add ParentFolderId to existing Folders table.
    try { db.Database.ExecuteSqlRaw("ALTER TABLE \"Folders\" ADD COLUMN \"ParentFolderId\" TEXT"); } catch { }

    // Idempotent: add new columns to Documents (SQLite has no ADD COLUMN IF NOT EXISTS).
    try { db.Database.ExecuteSqlRaw("ALTER TABLE \"Documents\" ADD COLUMN \"WorkspaceId\" TEXT"); } catch { }
    try { db.Database.ExecuteSqlRaw("ALTER TABLE \"Documents\" ADD COLUMN \"OwnerId\" TEXT"); } catch { }
    try { db.Database.ExecuteSqlRaw("ALTER TABLE \"Documents\" ADD COLUMN \"FolderId\" TEXT"); } catch { }

    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "ChatMessages" (
            "Id"          TEXT NOT NULL CONSTRAINT "PK_ChatMessages" PRIMARY KEY,
            "WorkspaceId" TEXT NOT NULL,
            "SenderId"    TEXT NOT NULL,
            "Content"     TEXT NOT NULL,
            "CreatedAt"   TEXT NOT NULL,
            CONSTRAINT "FK_ChatMessages_Workspaces_WorkspaceId" FOREIGN KEY ("WorkspaceId") REFERENCES "Workspaces" ("Id") ON DELETE CASCADE,
            CONSTRAINT "FK_ChatMessages_Users_SenderId" FOREIGN KEY ("SenderId") REFERENCES "Users" ("Id") ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS "IX_ChatMessages_WorkspaceId_CreatedAt" ON "ChatMessages" ("WorkspaceId", "CreatedAt");
        """);
    // Idempotent: chat messages carry the document they were sent from and the task they report on.
    try { db.Database.ExecuteSqlRaw("ALTER TABLE \"ChatMessages\" ADD COLUMN \"DocumentId\" TEXT"); } catch { }
    try { db.Database.ExecuteSqlRaw("ALTER TABLE \"ChatMessages\" ADD COLUMN \"AgentTaskId\" TEXT"); } catch { }

    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "AgentTasks" (
            "Id"            TEXT NOT NULL CONSTRAINT "PK_AgentTasks" PRIMARY KEY,
            "WorkspaceId"   TEXT NOT NULL,
            "DocumentId"    TEXT,
            "RequestedById" TEXT NOT NULL,
            "AgentId"       TEXT,
            "Prompt"        TEXT NOT NULL,
            "Status"        INTEGER NOT NULL,
            "WorkerId"      TEXT,
            "Error"         TEXT,
            "CreatedAt"     TEXT NOT NULL,
            "UpdatedAt"     TEXT NOT NULL,
            "ClaimedAt"     TEXT,
            "CompletedAt"   TEXT,
            CONSTRAINT "FK_AgentTasks_Workspaces_WorkspaceId" FOREIGN KEY ("WorkspaceId") REFERENCES "Workspaces" ("Id") ON DELETE CASCADE,
            CONSTRAINT "FK_AgentTasks_Documents_DocumentId" FOREIGN KEY ("DocumentId") REFERENCES "Documents" ("Id") ON DELETE CASCADE,
            CONSTRAINT "FK_AgentTasks_Users_RequestedById" FOREIGN KEY ("RequestedById") REFERENCES "Users" ("Id") ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS "IX_AgentTasks_Status_CreatedAt" ON "AgentTasks" ("Status", "CreatedAt");
        CREATE TABLE IF NOT EXISTS "AgentTaskEvents" (
            "Id"          TEXT NOT NULL CONSTRAINT "PK_AgentTaskEvents" PRIMARY KEY,
            "AgentTaskId" TEXT NOT NULL,
            "Type"        TEXT NOT NULL,
            "PayloadJson" TEXT NOT NULL,
            "CreatedAt"   TEXT NOT NULL,
            CONSTRAINT "FK_AgentTaskEvents_AgentTasks_AgentTaskId" FOREIGN KEY ("AgentTaskId") REFERENCES "AgentTasks" ("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "IX_AgentTaskEvents_AgentTaskId" ON "AgentTaskEvents" ("AgentTaskId");
        """);

    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "Agents" (
            "Id" TEXT NOT NULL CONSTRAINT "PK_Agents" PRIMARY KEY, "WorkspaceId" TEXT NOT NULL,
            "Name" TEXT NOT NULL, "Description" TEXT, "AvatarUrl" TEXT, "Provider" TEXT NOT NULL, "Model" TEXT,
            "SystemPrompt" TEXT, "Enabled" INTEGER NOT NULL, "MaxTurns" INTEGER NOT NULL, "TimeoutSeconds" INTEGER NOT NULL,
            "AuthMode" TEXT, "ApiKeyEncrypted" TEXT, "OAuthTokenEncrypted" TEXT, "ReasoningEffort" TEXT,
            "SandboxMode" TEXT, "ApprovalPolicy" TEXT, "PermissionMode" TEXT, "EndpointUrl" TEXT,
            "Protocol" TEXT, "HeadersJson" TEXT, "CreatedAt" TEXT NOT NULL, "UpdatedAt" TEXT NOT NULL,
            CONSTRAINT "FK_Agents_Workspaces_WorkspaceId" FOREIGN KEY ("WorkspaceId") REFERENCES "Workspaces" ("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "IX_Agents_WorkspaceId" ON "Agents" ("WorkspaceId");
        CREATE TABLE IF NOT EXISTS "McpServers" (
            "Id" TEXT NOT NULL CONSTRAINT "PK_McpServers" PRIMARY KEY, "WorkspaceId" TEXT NOT NULL,
            "Name" TEXT NOT NULL, "Description" TEXT, "Transport" TEXT NOT NULL, "EndpointUrl" TEXT,
            "Command" TEXT, "ArgumentsJson" TEXT, "AuthType" TEXT, "CredentialEncrypted" TEXT, "HeadersJson" TEXT,
            "Enabled" INTEGER NOT NULL, "CreatedAt" TEXT NOT NULL, "UpdatedAt" TEXT NOT NULL,
            CONSTRAINT "FK_McpServers_Workspaces_WorkspaceId" FOREIGN KEY ("WorkspaceId") REFERENCES "Workspaces" ("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "IX_McpServers_WorkspaceId" ON "McpServers" ("WorkspaceId");
        CREATE TABLE IF NOT EXISTS "SkillDefinitions" (
            "Id" TEXT NOT NULL CONSTRAINT "PK_SkillDefinitions" PRIMARY KEY, "WorkspaceId" TEXT NOT NULL,
            "Name" TEXT NOT NULL, "Description" TEXT, "Version" TEXT NOT NULL, "Instructions" TEXT NOT NULL,
            "Enabled" INTEGER NOT NULL, "CreatedAt" TEXT NOT NULL, "UpdatedAt" TEXT NOT NULL,
            CONSTRAINT "FK_SkillDefinitions_Workspaces_WorkspaceId" FOREIGN KEY ("WorkspaceId") REFERENCES "Workspaces" ("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "IX_SkillDefinitions_WorkspaceId" ON "SkillDefinitions" ("WorkspaceId");
        CREATE TABLE IF NOT EXISTS "AgentMcpServers" (
            "AgentId" TEXT NOT NULL, "McpServerId" TEXT NOT NULL,
            CONSTRAINT "PK_AgentMcpServers" PRIMARY KEY ("AgentId", "McpServerId"),
            CONSTRAINT "FK_AgentMcpServers_Agents_AgentId" FOREIGN KEY ("AgentId") REFERENCES "Agents" ("Id") ON DELETE CASCADE,
            CONSTRAINT "FK_AgentMcpServers_McpServers_McpServerId" FOREIGN KEY ("McpServerId") REFERENCES "McpServers" ("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "IX_AgentMcpServers_McpServerId" ON "AgentMcpServers" ("McpServerId");
        CREATE TABLE IF NOT EXISTS "AgentSkills" (
            "AgentId" TEXT NOT NULL, "SkillId" TEXT NOT NULL,
            CONSTRAINT "PK_AgentSkills" PRIMARY KEY ("AgentId", "SkillId"),
            CONSTRAINT "FK_AgentSkills_Agents_AgentId" FOREIGN KEY ("AgentId") REFERENCES "Agents" ("Id") ON DELETE CASCADE,
            CONSTRAINT "FK_AgentSkills_SkillDefinitions_SkillId" FOREIGN KEY ("SkillId") REFERENCES "SkillDefinitions" ("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "IX_AgentSkills_SkillId" ON "AgentSkills" ("SkillId");
        """);

    // Idempotent: agents gained an optional avatar after the table shipped.
    try { db.Database.ExecuteSqlRaw("ALTER TABLE \"Agents\" ADD COLUMN \"AvatarUrl\" TEXT"); } catch { }
    // Idempotent: a task remembers which agent the chat message tagged.
    try { db.Database.ExecuteSqlRaw("ALTER TABLE \"AgentTasks\" ADD COLUMN \"AgentId\" TEXT"); } catch { }

    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "AgentSchedules" (
            "Id" TEXT NOT NULL CONSTRAINT "PK_AgentSchedules" PRIMARY KEY,
            "WorkspaceId" TEXT NOT NULL, "CreatedById" TEXT NOT NULL,
            "AgentId" TEXT NULL, "DocumentId" TEXT NULL,
            "Name" TEXT NOT NULL, "Prompt" TEXT NOT NULL,
            "Interval" INTEGER NOT NULL, "Unit" INTEGER NOT NULL, "Enabled" INTEGER NOT NULL,
            "NextRunAt" TEXT NOT NULL, "LastRunAt" TEXT NULL, "LastTaskId" TEXT NULL,
            "CreatedAt" TEXT NOT NULL, "UpdatedAt" TEXT NOT NULL,
            FOREIGN KEY ("WorkspaceId") REFERENCES "Workspaces" ("Id") ON DELETE CASCADE,
            FOREIGN KEY ("CreatedById") REFERENCES "Users" ("Id") ON DELETE RESTRICT,
            FOREIGN KEY ("AgentId") REFERENCES "Agents" ("Id") ON DELETE SET NULL,
            FOREIGN KEY ("DocumentId") REFERENCES "Documents" ("Id") ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS "IX_AgentSchedules_Enabled_NextRunAt" ON "AgentSchedules" ("Enabled", "NextRunAt");
        CREATE INDEX IF NOT EXISTS "IX_AgentSchedules_WorkspaceId" ON "AgentSchedules" ("WorkspaceId");
        """);

    // Drive chat tasks have no open document. Upgrade older databases whose
    // AgentTasks.DocumentId column was created as NOT NULL.
    var connection = db.Database.GetDbConnection();
    if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
    await using (var command = connection.CreateCommand())
    {
        command.CommandText = "SELECT \"notnull\" FROM pragma_table_info('AgentTasks') WHERE name = 'DocumentId'";
        var documentIdIsRequired = Convert.ToInt32(await command.ExecuteScalarAsync() ?? 0) == 1;
        if (documentIdIsRequired)
        {
            db.Database.ExecuteSqlRaw("PRAGMA foreign_keys = OFF");
            db.Database.ExecuteSqlRaw("""
                CREATE TABLE "AgentTasks_New" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_AgentTasks_New" PRIMARY KEY,
                    "WorkspaceId" TEXT NOT NULL, "DocumentId" TEXT NULL, "RequestedById" TEXT NOT NULL,
                    "AgentId" TEXT NULL, "Prompt" TEXT NOT NULL, "Status" INTEGER NOT NULL,
                    "WorkerId" TEXT NULL, "Error" TEXT NULL, "CreatedAt" TEXT NOT NULL,
                    "UpdatedAt" TEXT NOT NULL, "ClaimedAt" TEXT NULL, "CompletedAt" TEXT NULL,
                    FOREIGN KEY ("WorkspaceId") REFERENCES "Workspaces" ("Id") ON DELETE CASCADE,
                    FOREIGN KEY ("DocumentId") REFERENCES "Documents" ("Id") ON DELETE CASCADE,
                    FOREIGN KEY ("RequestedById") REFERENCES "Users" ("Id") ON DELETE RESTRICT,
                    FOREIGN KEY ("AgentId") REFERENCES "Agents" ("Id") ON DELETE SET NULL
                );
                INSERT INTO "AgentTasks_New" SELECT "Id", "WorkspaceId", "DocumentId", "RequestedById",
                    "AgentId", "Prompt", "Status", "WorkerId", "Error", "CreatedAt", "UpdatedAt", "ClaimedAt", "CompletedAt"
                    FROM "AgentTasks";
                DROP TABLE "AgentTasks";
                ALTER TABLE "AgentTasks_New" RENAME TO "AgentTasks";
                CREATE INDEX "IX_AgentTasks_Status_CreatedAt" ON "AgentTasks" ("Status", "CreatedAt");
                CREATE INDEX "IX_AgentTasks_WorkspaceId" ON "AgentTasks" ("WorkspaceId");
                CREATE INDEX "IX_AgentTasks_DocumentId" ON "AgentTasks" ("DocumentId");
                CREATE INDEX "IX_AgentTasks_RequestedById" ON "AgentTasks" ("RequestedById");
                CREATE INDEX "IX_AgentTasks_AgentId" ON "AgentTasks" ("AgentId");
                """);
            db.Database.ExecuteSqlRaw("PRAGMA foreign_keys = ON");
        }
    }

    var agentEmail = builder.Configuration["AgentWorker:UserEmail"];
    var agentPassword = builder.Configuration["AgentWorker:UserPassword"];
    if (!string.IsNullOrWhiteSpace(agentEmail) && !string.IsNullOrWhiteSpace(agentPassword) &&
        !db.Users.Any(user => user.Email == agentEmail))
    {
        var auth = scope.ServiceProvider.GetRequiredService<IAuthService>();
        await auth.RegisterAsync("AI Agent", agentEmail, agentPassword);
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

var uploadPath = builder.Configuration["Storage:UploadPath"] ?? "uploads";
Directory.CreateDirectory(uploadPath);

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapControllers();
app.MapHub<ChatHub>("/hubs/chat");

app.Run();
