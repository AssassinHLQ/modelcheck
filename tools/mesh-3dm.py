# Rhino 8: EditPythonScript 里运行
# 把 Brep 曲面转成粗网格（供网页浏览），保留原文件不动，另存新文件
import rhinoscriptsyntax as rs
import scriptcontext as sc
import Rhino
import os

src = r"C:\Users\WY157\Desktop\RHINO\SEALED_before_brep_conversion_20260805.3dm"
dst = r"C:\Users\WY157\Desktop\RHINO\SEALED_view.3dm"

rs.Command('_-Open "%s"' % src, echo=False)

bbox = sc.doc.BoundingBox
if bbox:
    diag = bbox.Diagonal.Length
else:
    diag = 10.0

mp = Rhino.Geometry.MeshingParameters.Default
mp.MaximumEdgeLength = diag * 0.01   # 边长约为模型尺寸的 1%，够看但省体积
mp.MinimumEdgeLength = 0.0
mp.SimplePlanes = True
mp.RefineGrid = False
mp.JaggedSeams = True

done = 0
fail = 0
for oid in rs.AllObjects():
    gobj = sc.doc.Objects.Find(oid)
    if gobj is None:
        continue
    g = gobj.Geometry
    try:
        if isinstance(g, Rhino.Geometry.Brep):
            mesh = Rhino.Geometry.Mesh.CreateFromBrep(g, mp)
            if mesh:
                sc.doc.Objects.Replace(oid, mesh)
                done += 1
                continue
        elif isinstance(g, Rhino.Geometry.Extrusion):
            mesh = Rhino.Geometry.Mesh.CreateFromBrep(g.ToBrep(False), mp)
            if mesh:
                sc.doc.Objects.Replace(oid, mesh)
                done += 1
                continue
        elif isinstance(g, Rhino.Geometry.Mesh):
            done += 1
            continue
    except Exception as e:
        pass
    fail += 1

print("网格化完成: %d 个对象, 跳过 %d 个" % (done, fail))
sc.doc.Purge()
rs.Command('_-SaveAs "%s"' % dst, echo=False)
print("网格版大小: %.1f MB" % (os.path.getsize(dst) / 1024 / 1024 if os.path.exists(dst) else -1))
