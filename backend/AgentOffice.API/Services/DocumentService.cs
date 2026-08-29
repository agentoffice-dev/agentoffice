using Microsoft.EntityFrameworkCore;
using AgentOffice.API.Data;
using AgentOffice.API.Models;
using AgentOffice.API.Events;
using System.IO.Compression;
using System.Text;

namespace AgentOffice.API.Services;

public class DocumentService(AppDbContext db, IConfiguration config, IEventPublisher events) : IDocumentService
{
    private readonly string _uploadPath = config["Storage:UploadPath"] ?? "uploads";

    public async Task<IEnumerable<Document>> GetAllAsync() =>
        await db.Documents.OrderByDescending(d => d.UpdatedAt).ToListAsync();

    public async Task<Document?> GetByIdAsync(Guid id) =>
        await db.Documents.FindAsync(id);

    public async Task<Document> UploadAsync(IFormFile file)
    {
        var id = Guid.NewGuid();
        var ext = Path.GetExtension(file.FileName);
        var storagePath = Path.Combine(_uploadPath, $"{id}{ext}");

        await using var fs = File.Create(storagePath);
        await file.CopyToAsync(fs);

        var doc = new Document
        {
            Id = id,
            FileName = file.FileName,
            ContentType = file.ContentType,
            Size = file.Length,
            StoragePath = storagePath,
        };

        db.Documents.Add(doc);
        await db.SaveChangesAsync();
        return doc;
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var doc = await db.Documents.FindAsync(id);
        if (doc is null) return false;
        var workspaceId = doc.WorkspaceId;

        if (File.Exists(doc.StoragePath))
            File.Delete(doc.StoragePath);

        db.Documents.Remove(doc);
        await db.SaveChangesAsync();
        if (workspaceId is Guid owningWorkspaceId)
            await events.PublishAsync(new DocumentDeletedEvent(owningWorkspaceId, doc.Id));
        return true;
    }

    public async Task<(Stream stream, Document document)?> GetFileStreamAsync(Guid id)
    {
        var doc = await db.Documents.FindAsync(id);
        if (doc is null || !File.Exists(doc.StoragePath)) return null;
        return (File.OpenRead(doc.StoragePath), doc);
    }

    public async Task<Document> UploadAsync(IFormFile file, Guid workspaceId, Guid ownerId, Guid? folderId = null)
    {
        var id = Guid.NewGuid();
        var ext = Path.GetExtension(file.FileName);
        var storagePath = Path.Combine(_uploadPath, $"{id}{ext}");

        await using var fs = File.Create(storagePath);
        await file.CopyToAsync(fs);

        var doc = new Document
        {
            Id = id,
            FileName = file.FileName,
            ContentType = file.ContentType,
            Size = file.Length,
            StoragePath = storagePath,
            WorkspaceId = workspaceId,
            OwnerId = ownerId,
            FolderId = folderId,
        };

        db.Documents.Add(doc);
        await db.SaveChangesAsync();
        await events.PublishAsync(new DocumentCreatedEvent(doc));
        return doc;
    }

    public async Task<IEnumerable<Document>> GetByWorkspaceAsync(Guid workspaceId) =>
        await db.Documents
            .Where(d => d.WorkspaceId == workspaceId)
            .OrderByDescending(d => d.UpdatedAt)
            .ToListAsync();

    public async Task<IEnumerable<Document>> GetByFolderAsync(Guid folderId) =>
        await db.Documents
            .Where(d => d.FolderId == folderId)
            .OrderByDescending(d => d.UpdatedAt)
            .ToListAsync();

    public async Task<Document?> MoveAsync(Guid id, Guid? folderId)
    {
        var doc = await db.Documents.FindAsync(id);
        if (doc is null) return null;
        doc.FolderId = folderId;
        doc.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return doc;
    }

    public async Task<Document?> CloneAsync(Guid id, string? customFileName = null, Guid? targetFolderId = null)
    {
        var src = await db.Documents.FindAsync(id);
        if (src is null || !File.Exists(src.StoragePath)) return null;

        var newId = Guid.NewGuid();
        var ext = Path.GetExtension(src.FileName);
        var baseName = Path.GetFileNameWithoutExtension(src.FileName);
        var newStoragePath = Path.Combine(_uploadPath, $"{newId}{ext}");

        File.Copy(src.StoragePath, newStoragePath);

        var fileName = string.IsNullOrWhiteSpace(customFileName)
            ? $"Copy of {baseName}{ext}"
            : customFileName.Trim();

        var clone = new Document
        {
            Id = newId,
            FileName = fileName,
            ContentType = src.ContentType,
            Size = src.Size,
            StoragePath = newStoragePath,
            WorkspaceId = src.WorkspaceId,
            OwnerId = src.OwnerId,
            FolderId = targetFolderId ?? src.FolderId,
        };

        db.Documents.Add(clone);
        await db.SaveChangesAsync();
        await events.PublishAsync(new DocumentCreatedEvent(clone));
        return clone;
    }

    public async Task<Document?> RenameAsync(Guid id, string newName)
    {
        var doc = await db.Documents.FindAsync(id);
        if (doc is null) return null;
        doc.FileName = newName;
        doc.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await events.PublishAsync(new DocumentRenamedEvent(doc));
        return doc;
    }

    public async Task<Document> CreateOfficeDocumentAsync(
        string kind, string? fileName, Guid workspaceId, Guid ownerId, Guid? folderId = null)
    {
        if (folderId is not null && !await db.Folders.AnyAsync(f => f.Id == folderId && f.WorkspaceId == workspaceId))
            throw new ArgumentException("Folder does not belong to this workspace.", nameof(folderId));

        var (extension, contentType, entries) = kind.ToLowerInvariant() switch
        {
            "word" => (".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", WordEntries()),
            "excel" => (".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ExcelEntries()),
            "powerpoint" => (".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", PowerPointEntries()),
            _ => throw new ArgumentException("Unsupported Office document type.", nameof(kind)),
        };

        var defaultName = kind.ToLowerInvariant() switch
        {
            "word" => "Untitled document",
            "excel" => "Untitled spreadsheet",
            "powerpoint" => "Untitled presentation",
            _ => "Untitled",
        };
        var safeBaseName = string.IsNullOrWhiteSpace(fileName)
            ? defaultName
            : Path.GetFileNameWithoutExtension(fileName.Trim());
        if (string.IsNullOrWhiteSpace(safeBaseName)) safeBaseName = defaultName;
        var finalName = safeBaseName + extension;
        var id = Guid.NewGuid();
        var storagePath = Path.Combine(_uploadPath, $"{id}{extension}");
        Directory.CreateDirectory(_uploadPath);

        await using (var stream = File.Create(storagePath))
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
        {
            foreach (var (path, xml) in entries)
            {
                var entry = archive.CreateEntry(path, CompressionLevel.Fastest);
                await using var entryStream = entry.Open();
                await using var writer = new StreamWriter(entryStream, new UTF8Encoding(false));
                await writer.WriteAsync(xml);
            }
        }

        var doc = new Document
        {
            Id = id,
            FileName = finalName,
            ContentType = contentType,
            Size = new FileInfo(storagePath).Length,
            StoragePath = storagePath,
            WorkspaceId = workspaceId,
            OwnerId = ownerId,
            FolderId = folderId,
        };
        db.Documents.Add(doc);
        await db.SaveChangesAsync();
        await events.PublishAsync(new DocumentCreatedEvent(doc));
        return doc;
    }

    private static Dictionary<string, string> WordEntries() => new()
    {
        ["[Content_Types].xml"] = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>""",
        ["_rels/.rels"] = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>""",
        ["word/document.xml"] = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>""",
    };

    private static Dictionary<string, string> ExcelEntries() => new()
    {
        ["[Content_Types].xml"] = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>""",
        ["_rels/.rels"] = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>""",
        ["xl/workbook.xml"] = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>""",
        ["xl/_rels/workbook.xml.rels"] = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>""",
        ["xl/worksheets/sheet1.xml"] = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>""",
    };

    private static Dictionary<string, string> PowerPointEntries() => new()
    {
        ["[Content_Types].xml"] = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>""",
        ["_rels/.rels"] = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>""",
        ["ppt/presentation.xml"] = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>""",
        ["ppt/_rels/presentation.xml.rels"] = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>""",
        ["ppt/slides/slide1.xml"] = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>""",
    };

    public async Task UpdateFileAsync(Guid id, Stream content)
    {
        var doc = await db.Documents.FindAsync(id);
        if (doc is null) return;

        await using (var fs = File.Create(doc.StoragePath))
        {
            await content.CopyToAsync(fs);
            doc.Size = fs.Length;
        }

        doc.Version = Guid.NewGuid().ToString("N");
        doc.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }
}
