using AgentOffice.API.Data;
using AgentOffice.API.Models;
using Microsoft.EntityFrameworkCore;

namespace AgentOffice.API.Services;

public class AgentScheduleWorker(IServiceScopeFactory scopes, ILogger<AgentScheduleWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(15));
        do
        {
            try { await DispatchDueAsync(stoppingToken); }
            catch (Exception ex) { logger.LogError(ex, "Failed to dispatch scheduled agent tasks"); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task DispatchDueAsync(CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var tasks = scope.ServiceProvider.GetRequiredService<IAgentTaskService>();
        var now = DateTime.UtcNow;
        var due = await db.AgentSchedules.Where(x => x.Enabled && x.NextRunAt <= now)
            .OrderBy(x => x.NextRunAt).Take(25).ToListAsync(cancellationToken);
        foreach (var schedule in due)
        {
            var scheduledFor = schedule.NextRunAt;
            schedule.NextRunAt = NextAfter(schedule, now);
            schedule.LastRunAt = now;
            schedule.UpdatedAt = now;
            await db.SaveChangesAsync(cancellationToken);
            var task = await tasks.CreateAsync(schedule.WorkspaceId, schedule.DocumentId, schedule.CreatedById,
                schedule.Prompt, schedule.AgentId);
            if (task is not null) { schedule.LastTaskId = task.Id; await db.SaveChangesAsync(cancellationToken); }
            else logger.LogWarning("Schedule {ScheduleId} due at {ScheduledFor} could not create a task", schedule.Id, scheduledFor);
        }
    }

    private static DateTime NextAfter(AgentSchedule schedule, DateTime now)
    {
        var next = schedule.NextRunAt;
        do next = schedule.Unit switch {
            AgentScheduleUnit.Minutes => next.AddMinutes(schedule.Interval),
            AgentScheduleUnit.Hours => next.AddHours(schedule.Interval),
            AgentScheduleUnit.Weeks => next.AddDays(7 * schedule.Interval),
            _ => next.AddDays(schedule.Interval),
        }; while (next <= now);
        return next;
    }
}
