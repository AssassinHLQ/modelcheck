# Rhino 8: EditPythonScript 里运行
# 组合清理：Purge -> 合并共面曲面 -> 紧凑保存 -> 压缩保存，逐阶段报告大小
import rhinoscriptsyntax as rs
import scriptcontext as sc
import os

src = r"C:\Users\WY157\Desktop\RHINO\SEALED_before_brep_conversion_20260805.3dm"
base = r"C:\Users\WY157\Desktop\RHINO"

def mb(p):
    return os.path.getsize(p) / 1024 / 1024 if os.path.exists(p) else -1

print("原始大小: %.1f MB" % (mb(src)))

rs.Command('_-Open "%s"' % src, echo=False)

# 1) 清理未使用数据
sc.doc.Purge()
p1 = os.path.join(base, "SEALED_purged.3dm")
rs.Command('_-SaveAs "%s"' % p1, echo=False)
print("1) Purge 清理后: %.1f MB" % mb(p1))

# 2) 合并共面/相邻曲面（可能较慢，视模型复杂度）
try:
    rs.Command("_MergeAllFaces", echo=False)
    p2 = os.path.join(base, "SEALED_merged.3dm")
    rs.Command('_-SaveAs "%s"' % p2, echo=False)
    print("2) 合并曲面后: %.1f MB" % mb(p2))
except Exception as e:
    print("2) 合并失败（跳过）: %s" % e)

# 3) 紧凑保存 SaveSmall（去掉冗余）
try:
    p3 = os.path.join(base, "SEALED_small.3dm")
    rs.Command('_-SaveSmall "%s"' % p3, echo=False)
    print("3) SaveSmall 紧凑保存: %.1f MB" % mb(p3))
except Exception as e:
    print("3) SaveSmall 不可用: %s" % e)

# 4) 压缩保存（OpenNURBS 压缩选项，若 Rhino 支持）
try:
    opts = Rhino.FileIO.FileWriteOptions()
    opts.Compressed = True
    p4 = os.path.join(base, "SEALED_compressed.3dm")
    if sc.doc.WriteFile(p4, opts):
        print("4) 压缩保存: %.1f MB" % mb(p4))
    else:
        print("4) 压缩保存失败")
except Exception as e:
    print("4) 压缩选项不可用: %s" % e)

print("全部完成，看哪个最小就用哪个（记得先测试能否正常打开）")
