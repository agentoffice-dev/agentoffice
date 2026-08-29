using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace AgentOffice.API.Data;

/// <summary>
/// Keeps every stored <see cref="DateTime"/> UTC in both directions.
///
/// SQLite writes dates as offset-less text, so a row read back comes out as
/// <see cref="DateTimeKind.Unspecified"/>. System.Text.Json then serializes it without the
/// trailing `Z`, and a browser reads an offset-less timestamp as *local* time — which moves
/// anything sourced from the database hours away from the same value sent straight from
/// memory, and shuffles the chat timeline.
/// </summary>
public class UtcDateTimeConverter : ValueConverter<DateTime, DateTime>
{
    public UtcDateTimeConverter() : base(
        value => value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : value,
        value => DateTime.SpecifyKind(value, DateTimeKind.Utc))
    { }
}
