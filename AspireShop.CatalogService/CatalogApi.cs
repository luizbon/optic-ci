using AspireShop.CatalogDb;

namespace AspireShop.CatalogService;

public static class CatalogApi
{
    public static IEndpointRouteBuilder MapCatalogApi(this IEndpointRouteBuilder routes)
    {
        var v1 = routes.MapGroup("/api/v1/catalog");
        var v2 = routes.MapGroup("/api/v2/catalog");

        v1.MapCatalogApi();
        v2.MapCatalogApi();

        return routes;
    }

    public static RouteGroupBuilder MapCatalogApi(this RouteGroupBuilder group)
    {
        group.WithTags("Catalog");

        group.MapGet("items/type/all/brand/{catalogBrandId?}", async (int? catalogBrandId, CatalogDbContext catalogContext, int? before, int? after, int pageSize = 8) =>
        {
            var itemsOnPage = await catalogContext.GetCatalogItemsCompiledAsync(catalogBrandId, before, after, pageSize);

            var (firstId, nextId) = itemsOnPage switch
            {
            [] => (0, 0),
            [var only] => (only.Id, only.Id),
            [var first, .., var last] => (first.Id, last.Id)
            };

            return new CatalogItemsPage(
                firstId,
                nextId,
                itemsOnPage.Count < pageSize,
                itemsOnPage.Take(pageSize));
        });

        group.MapGet("items/{catalogItemId:int}/image", async (int catalogItemId, CatalogDbContext catalogDbContext, IHostEnvironment environment) =>
        {
            var item = await catalogDbContext.CatalogItems.FindAsync(catalogItemId);

            if (item is null)
            {
                return Results.NotFound();
            }

            var path = Path.Combine(environment.ContentRootPath, "Images", item.PictureFileName);

            if (!File.Exists(path))
            {
                return Results.NotFound();
            }

            return Results.File(path, "image/jpeg");
        })
        .Produces(404)
        .Produces(200, contentType: "image/jpeg");

        return group;
    }
}

public record CatalogItemsPage(int FirstId, int NextId, bool IsLastPage, IEnumerable<CatalogItem> Data);
